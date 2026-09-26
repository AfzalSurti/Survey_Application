"""Build the GDRPL work report (DOCX or PDF): Q&A page + photo pages per structure."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Inches, Pt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Project, SurveyPhoto, SurveyRecord

logger = logging.getLogger(__name__)

# record_id -> ordered list of image byte blobs ready to embed
PhotoBlobs = dict[UUID, list[bytes]]


SKIP_KEYS = {"gps", "capturedAt", "structure_category", "photos"}


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, list):
        return ", ".join(str(v) for v in value) if value else "—"
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _category_label(key: str | None) -> str:
    if not key:
        return "Structure"
    return key.replace("_", " ").title()


# category -> [(question id, label, is_conditional)] in questionnaire order
QuestionIndex = dict[str, list[tuple[str, str, bool]]]


def build_question_index(schemas: list[tuple[int, dict]]) -> QuestionIndex:
    """Question labels + order per structure category, from every stored schema version.

    Newest version wins (its labels and its order); questions that only exist in an
    older version are appended, so records captured on an old form still print fully.
    """
    index: QuestionIndex = {}
    seen: dict[str, set[str]] = {}
    for _version, schema_json in sorted(schemas, key=lambda item: item[0], reverse=True):
        for category, body in (schema_json.get("categories") or {}).items():
            bucket = index.setdefault(category, [])
            known = seen.setdefault(category, set())
            for question in (body or {}).get("questions") or []:
                qid = question.get("id")
                if not qid or question.get("type") == "photo_group" or qid in known:
                    continue
                known.add(qid)
                bucket.append((qid, str(question.get("label") or qid), bool(question.get("show_if"))))
    return index


LIST_KEYS = ("observations", "recommendations")
_ROW_SKIP = SKIP_KEYS | {"chainage", "name_of_road", *LIST_KEYS}


def _chainage_sort_key(record: SurveyRecord) -> tuple:
    """183+862 -> (183862,) so structures print in road order; unparseable ones go last."""
    match = re.match(r"\s*(\d+)\s*\+\s*(\d+)", record.chainage or "")
    if match:
        return (0, int(match.group(1)) * 1000 + int(match.group(2)), record.chainage)
    return (1, 0, record.chainage or "")


def _response_rows(
    record: SurveyRecord,
    question_index: QuestionIndex | None = None,
) -> list[tuple[str, str]]:
    responses = record.responses_json or {}
    gps = responses.get("gps") if isinstance(responses.get("gps"), dict) else {}
    lat = gps.get("latitude", record.latitude)
    lon = gps.get("longitude", record.longitude)
    coords = f"{lat}, {lon}" if lat is not None and lon is not None else ""
    project = getattr(record, "project", None)

    rows: list[tuple[str, str]] = [
        ("Name of Road / Project", str(responses.get("name_of_road") or (project.name if project else "") or "")),
        (
            "Location of structure in Km.",
            f"{record.chainage or ''} — {_category_label(record.structure_category).upper()}".strip(" —"),
        ),
        ("Coordinates", coords),
    ]

    asked = (question_index or {}).get(record.structure_category or "")
    if asked:
        known = set()
        for qid, label, conditional in asked:
            known.add(qid)
            if qid in _ROW_SKIP:
                continue
            value = responses.get(qid)
            answered = value not in (None, "", [])
            if not answered and conditional:
                continue  # a question that was hidden for this structure
            rows.append((label, _fmt(value) if answered else ""))
        extras = [k for k in responses if k not in known and k not in _ROW_SKIP]
    else:
        extras = [k for k in responses if k not in _ROW_SKIP]
    for key in extras:
        rows.append((key.replace("_", " ").strip().title(), _fmt(responses[key])))
    return rows


def bullet_items(record: SurveyRecord, key: str) -> list[str]:
    """Observations / recommendations as clean bullet text.

    New forms store a list; an older app (or an old free-text answer) stores a
    string, so split that on line breaks and it still prints as bullets.
    """
    value = (record.responses_json or {}).get(key)
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, list):
        return []
    items = []
    for item in value:
        text = re.sub(r"^\s*(?:[-*\u2022]|\d+[.)])\s*", "", str(item)).strip()
        if text:
            items.append(text)
    return items


_GRADE_SEPARATED = {
    "VUP": "Vehicle Underpass (VUP)",
    "LVUP": "Light Vehicle Underpass (LVUP)",
    "FLYOVER": "Flyover",
    "ELEVATED CORRIDOR": "Elevated Corridor",
    "ROB": "Railway Over Bridge (ROB)",
    "ROU": "Railway Under Bridge (ROU)",
}


def structure_type_label(record: SurveyRecord) -> str:
    """Name used in table titles and the summary, e.g. "Minor Bridge", "Vehicle Underpass (VUP)"."""
    responses = record.responses_json or {}
    category = record.structure_category or ""
    if category == "major_minor_bridge_girder":
        return {"Major": "Major Bridge", "Minor": "Minor Bridge"}.get(
            str(responses.get("bridge_type")), "Major / Minor Bridge"
        )
    if category == "minor_bridge_girder_or_box":
        return "Minor Bridge"
    if category == "box_or_slab_culvert":
        return str(responses.get("box_or_slab") or "Box / Slab Culvert")
    if category == "grade_separated_structure":
        raw = str(responses.get("structure_type") or "").strip()
        return _GRADE_SEPARATED.get(raw.upper(), raw.title() if raw else "Grade Separated Structure")
    return _category_label(category)


def _plural(count: int, label: str) -> str:
    if count == 1:
        return label
    head, sep, tail = label.partition(" (")
    return f"{head}s{sep}{tail}" if sep else f"{label}s"


def _with_unit(value: object) -> str:
    text = str(value).strip() if value not in (None, "") else ""
    if not text:
        return "-"
    return text if re.search(r"[A-Za-z]", text) else f"{text} m"


def summary_row(record: SurveyRecord) -> list[str]:
    responses = record.responses_json or {}
    return [
        record.chainage or "-",
        structure_type_label(record),
        str(responses.get("river_name") or "-"),
        str(responses.get("span_arrangement") or responses.get("pipe_size") or "-"),
        _with_unit(responses.get("total_length_of_bridge") or responses.get("total_horizontal_vent_width")),
    ]


@dataclass
class ReportContext:
    """Everything printed on the cover and in the introduction."""

    project_name: str = ""
    client_name: str | None = None
    piu_name: str | None = None
    consultant_name: str | None = None
    association_name: str | None = None
    work_name: str | None = None
    background_text: str | None = None
    visit_from: date | None = None
    visit_to: date | None = None
    report_month: str = ""


def _intro_paragraphs(ctx: ReportContext, records: list[SurveyRecord]) -> tuple[list[str], list[str]]:
    """(1.1 Project Background paragraphs, 1.2 Site Visit paragraphs)."""
    if ctx.background_text and ctx.background_text.strip():
        background = [chunk.strip() for chunk in re.split(r"\n\s*\n", ctx.background_text) if chunk.strip()]
    else:
        work = ctx.work_name or ctx.project_name
        if ctx.client_name and work:
            text = f"{ctx.client_name} has proposed the {work}."
        elif work:
            text = f"This report presents the inventory survey carried out for the {work}."
        else:
            text = "This report presents the inventory survey carried out for the project."
        if ctx.consultant_name:
            text += f" The work has been awarded to M/s. {ctx.consultant_name}"
            text += f" in association with {ctx.association_name}." if ctx.association_name else "."
        background = [text]

    visit: list[str] = []
    if ctx.visit_from:
        def fmt(d: date) -> str:
            return d.strftime("%d/%m/%Y")

        same_day = ctx.visit_to in (None, ctx.visit_from)
        when = fmt(ctx.visit_from) if same_day else f"{fmt(ctx.visit_from)} To {fmt(ctx.visit_to)}"
        visit.append(f"The site was visited by our team on {when} to collect relevant information and data from the site.")
    counts = Counter(structure_type_label(r) for r in records)
    if counts:
        parts = [f"{n:02d} Number of {_plural(n, label)}" for label, n in counts.items()]
        joined = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
        visit.append(
            f"During the site visit it was found that the project stretch has a total of {joined}, "
            "and the condition survey of these structures was carried out by the team."
        )
    visit.append(
        "After the completion of the condition survey, the current condition of each structure was recorded together "
        "with the observations and recommendations. The following table shows the structure details in the project stretch."
    )
    return background, visit


def _set_cell_text(cell, text: str, *, bold: bool = False, center: bool = False) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    run = p.add_run(text)
    run.font.size = Pt(10)
    run.bold = bold
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def _add_bordered_table(document: Document, headers: list[str], rows: list[list[str]], col_widths: list[Cm]):
    table = document.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    for i, header in enumerate(headers):
        _set_cell_text(table.rows[0].cells[i], header, bold=True, center=True)
        table.rows[0].cells[i].width = col_widths[i]
    for r_idx, row in enumerate(rows, start=1):
        for c_idx, value in enumerate(row):
            _set_cell_text(table.rows[r_idx].cells[c_idx], value, center=(c_idx == 0))
            table.rows[r_idx].cells[c_idx].width = col_widths[c_idx]
    return table


def _is_remote_photo(url: str | None) -> bool:
    return bool(url) and url.startswith("http") and "stub-" not in url and "drive.google.com" not in url


def _report_size_variant(url: str, max_width: int = 700) -> str:
    """Ask Cloudinary for a resized copy instead of the full camera original.

    Reports/exports only ever display these at a few centimetres — downloading
    (and, for Excel, embedding) the untouched multi-megabyte camera photo was
    making a 20-structure export take over a minute and balloon to 16+ MB.
    """
    if "res.cloudinary.com" in url and "/upload/" in url:
        return url.replace("/upload/", f"/upload/w_{max_width},q_auto,f_auto/", 1)
    return url


async def _fetch_one_photo(http: httpx.AsyncClient, photo: SurveyPhoto, max_width: int = 700) -> bytes | None:
    local = Path(photo.local_path) if photo.local_path else None
    if local and local.is_file():
        try:
            return local.read_bytes()
        except OSError:
            pass
    if _is_remote_photo(photo.drive_url):
        try:
            resp = await http.get(_report_size_variant(photo.drive_url, max_width))
            if resp.status_code == 200 and resp.content:
                return resp.content
        except httpx.HTTPError:
            logger.warning("Could not fetch report photo %s", photo.id)
    return None


async def collect_photo_blobs(records: list[SurveyRecord], max_width: int = 700) -> PhotoBlobs:
    """Resolve every structure's photos to raw image bytes, all in parallel.

    Prefers the local file (still on disk this deploy); otherwise downloads a
    resized Cloudinary copy. Photos captured before cloud storage — gone from
    disk with only a stub id — are skipped.
    """
    photo_lists = [list(getattr(record, "photos", []) or []) for record in records]
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as http:
        fetch_jobs = [
            asyncio.gather(*(_fetch_one_photo(http, photo, max_width) for photo in photos))
            for photos in photo_lists
        ]
        results = await asyncio.gather(*fetch_jobs)
    return {
        record.id: [blob for blob in blobs if blob is not None]
        for record, blobs in zip(records, results)
    }


def _add_photo_pages(document: Document, project_name: str, structure_index: int, photos: list[bytes]) -> None:
    """2x2 photo grids; automatically adds more pages when photo count > 4."""
    if not photos:
        document.add_page_break()
        title = document.add_paragraph()
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = title.add_run(project_name or "GDRPL Survey")
        run.bold = True
        run.font.size = Pt(14)
        document.add_paragraph(f"Page-2 (Photos of Structure-{structure_index})")
        document.add_paragraph("No photos captured for this structure.")
        return

    chunk_size = 4
    page_no = 2
    for start in range(0, len(photos), chunk_size):
        chunk = photos[start : start + chunk_size]
        document.add_page_break()
        header = document.add_paragraph()
        header.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = header.add_run(project_name or "GDRPL Survey")
        run.bold = True
        run.font.size = Pt(14)

        label = document.add_paragraph()
        label_run = label.add_run(f"Page-{page_no} (Photos of Structure-{structure_index})")
        label_run.bold = True

        # Always a 2x2 grid; empty cells if fewer than 4 on last page
        table = document.add_table(rows=2, cols=2)
        table.style = "Table Grid"
        for i in range(4):
            cell = table.rows[i // 2].cells[i % 2]
            cell.width = Cm(8)
            if i < len(chunk):
                try:
                    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = cell.paragraphs[0].add_run()
                    run.add_picture(BytesIO(chunk[i]), width=Inches(2.8))
                except Exception:
                    _set_cell_text(cell, f"Photo-{start + i + 1} (unavailable)", center=True)
            else:
                _set_cell_text(cell, f"Photo-{start + i + 1}", center=True)
        page_no += 1


def build_work_report_docx(
    *,
    project_name: str,
    records: list[SurveyRecord],
    photo_blobs: PhotoBlobs | None = None,
    question_index: QuestionIndex | None = None,
) -> bytes:
    """Return editable .docx bytes for the work report layout."""
    photo_blobs = photo_blobs or {}
    document = Document()

    # Narrow margins for report look
    for section in document.sections:
        section.top_margin = Cm(1.5)
        section.bottom_margin = Cm(1.5)
        section.left_margin = Cm(1.5)
        section.right_margin = Cm(1.5)

    for index, record in enumerate(records, start=1):
        if index > 1:
            document.add_page_break()

        header = document.add_paragraph()
        header.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = header.add_run(project_name or "GDRPL Survey")
        run.bold = True
        run.font.size = Pt(14)

        page_title = document.add_paragraph()
        page_title_run = page_title.add_run(f"Page-1 (Structure-{index})")
        page_title_run.bold = True

        data_rows = _response_rows(record, question_index)
        table_rows = [[str(i), desc, data] for i, (desc, data) in enumerate(data_rows, start=1)]
        _add_bordered_table(
            document,
            ["Sr. No", "Description", "Data"],
            table_rows,
            [Cm(2), Cm(7.5), Cm(7.5)],
        )

        for heading, key in (("Observations:", "observations"), ("Recommendations:", "recommendations")):
            items = bullet_items(record, key)
            if items:
                document.add_paragraph().add_run(heading).bold = True
                for text in items:
                    document.add_paragraph(text, style="List Bullet")

        _add_photo_pages(document, project_name, index, photo_blobs.get(record.id, []))

    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def build_work_report_pdf(
    *,
    project_name: str,
    records: list[SurveyRecord],
    photo_blobs: PhotoBlobs | None = None,
    question_index: QuestionIndex | None = None,
    context: ReportContext | None = None,
) -> bytes:
    """One project's full Inventory Survey Report, laid out like the client's own.

    Cover (client / PIU / consultant / name of work) -> Table of Contents and
    List of Tables with real page numbers -> 1 Introduction (background, site
    visit, summary of structures) -> for every structure "Table N <Type> at
    Chainage Km X", its Observations / Recommendations, then framed photo pages.
    Front matter is unnumbered; numbering starts at 1 on the Introduction.
    """
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        BaseDocTemplate,
        Flowable,
        Frame,
        PageBreak,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )
    from reportlab.platypus.tableofcontents import TableOfContents
    from reportlab.lib.utils import ImageReader

    photo_blobs = photo_blobs or {}
    ctx = context or ReportContext(project_name=project_name)
    ctx.project_name = ctx.project_name or project_name
    footer_label = ctx.project_name or "GDRPL Survey"
    blue_header = colors.HexColor("#5AA0D8")
    title_blue = colors.HexColor("#2F6EBA")
    margin = 1.7 * cm

    def style(name: str, **kw) -> ParagraphStyle:
        base = dict(fontName="Times-Roman", fontSize=10, leading=12.5)
        base.update(kw)
        return ParagraphStyle(name, **base)

    cover_label = style("CoverLabel", fontName="Times-Bold", fontSize=13, leading=18, alignment=TA_CENTER, spaceBefore=16)
    cover_text = style("CoverText", fontName="Times-Bold", fontSize=16, leading=21, alignment=TA_CENTER, textColor=title_blue)
    cover_title = style("CoverTitle", fontName="Times-Bold", fontSize=26, leading=32, alignment=TA_CENTER, spaceBefore=34)
    cover_date = style("CoverDate", fontName="Times-Bold", fontSize=15, leading=20, alignment=TA_CENTER, spaceBefore=12)
    h_toc = style("TocHeading", fontName="Times-Bold", fontSize=16, leading=20, spaceAfter=10, spaceBefore=6)
    h1 = style("H1", fontName="Times-Bold", fontSize=15, leading=19, spaceBefore=4, spaceAfter=8)
    h2 = style("H2", fontName="Times-Bold", fontSize=12.5, leading=16, spaceBefore=8, spaceAfter=5)
    body = style("Body", fontSize=11, leading=15, alignment=TA_JUSTIFY, spaceAfter=7)
    table_title = style("TableTitle", fontName="Times-Bold", fontSize=13, leading=17, alignment=TA_CENTER,
                        textColor=title_blue, spaceAfter=8, keepWithNext=1)
    head_cell = style("HeadCell", fontName="Times-Bold", fontSize=10.5, leading=13, alignment=TA_CENTER)
    desc_cell = style("DescCell", fontSize=10, leading=12.5)
    data_cell = style("DataCell", fontSize=10, leading=12.5, alignment=TA_CENTER)
    list_head = style("ListHead", fontName="Times-Bold", fontSize=11.5, leading=15, spaceBefore=12, spaceAfter=4)
    bullet = style("Bullet", fontSize=10.5, leading=14, leftIndent=16, bulletIndent=4, spaceAfter=3, alignment=TA_JUSTIFY)
    frame_head = style("FrameHead", fontName="Times-Bold", fontSize=11.5, leading=15, alignment=TA_CENTER)
    note = style("Note", fontName="Times-Italic", fontSize=9.5, leading=12, spaceBefore=6)

    render_mode = {"measure": True}

    class PhotoCell(Flowable):
        """A photo in a fixed cell. Fixed size = the page count never depends on the image, so the
        contents can be measured with these left blank and each JPEG decoded only once, for real."""

        def __init__(self, blob: bytes, width: float, height: float) -> None:
            super().__init__()
            self.blob, self.box_w, self.box_h = blob, width, height

        def wrap(self, avail_w, avail_h):  # noqa: ANN001
            return self.box_w, self.box_h

        def draw(self) -> None:
            if render_mode["measure"]:
                return
            try:
                image = ImageReader(BytesIO(self.blob))
                iw, ih = image.getSize()
                scale = min(self.box_w / iw, self.box_h / ih)
                w, h = iw * scale, ih * scale
                self.canv.drawImage(image, (self.box_w - w) / 2, (self.box_h - h) / 2, w, h)
            except Exception:  # noqa: BLE001
                self.canv.setFont("Times-Italic", 9.5)
                self.canv.drawCentredString(self.box_w / 2, self.box_h / 2, "Photograph unavailable")

    def esc(text: object) -> str:
        return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    # ---- contents pages: two indexes fed by different notifications -------------------------
    class TableList(TableOfContents):
        def notify(self, kind, stuff):  # noqa: ANN001
            if kind == "TableEntry":
                self.addEntry(*stuff)

    toc = TableOfContents()
    toc.dotsMinLevel = 0
    toc.levelStyles = [
        style("Toc0", fontName="Times-Bold", fontSize=11.5, leading=16, leftIndent=0, firstLineIndent=0, spaceBefore=3),
        style("Toc1", fontSize=10.5, leading=15, leftIndent=22, firstLineIndent=0),
    ]
    table_list = TableList()
    table_list.dotsMinLevel = 0
    table_list.levelStyles = [style("Tbl0", fontSize=10, leading=14, leftIndent=0, firstLineIndent=0, spaceBefore=1)]

    class ReportDoc(BaseDocTemplate):
        """Numbers pages from the Introduction (front matter is unnumbered) and feeds the indexes."""

        body_start: int | None = None

        def shown_page(self) -> int:
            return self.page - (self.body_start or self.page) + 1

        def afterFlowable(self, flowable) -> None:  # noqa: ANN001
            if not isinstance(flowable, Paragraph):
                return
            name = flowable.style.name
            if name == "H1":
                self.body_start = self.page
            if name in ("H1", "H2"):
                self.notify("TOCEntry", (0 if name == "H1" else 1, flowable.getPlainText(), self.shown_page()))
            elif name == "TableTitle":
                self.notify("TableEntry", (0, flowable.getPlainText(), self.shown_page()))

    def draw_footer(canvas, doc) -> None:  # noqa: ANN001
        if doc.body_start is None or doc.page < doc.body_start:
            return
        canvas.saveState()
        canvas.setFont("Times-Roman", 8.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(margin, 0.9 * cm, footer_label[:90])
        canvas.drawRightString(A4[0] - margin, 0.9 * cm, f"Page {doc.shown_page()}")
        canvas.restoreState()

    def build_story() -> list:
        """Fresh flowables for every layout pass (reportlab must not reuse them); only the two
        contents objects are shared, because they carry the page numbers between passes."""
        story: list = []

        # ---- cover -------------------------------------------------------------------------
        story.append(Spacer(1, 2.2 * cm))
        if ctx.client_name:
            story += [Paragraph("CLIENT", cover_label), Paragraph(esc(ctx.client_name.upper()), cover_text)]
        if ctx.piu_name:
            story.append(Paragraph(esc(f"NAME OF PIU: {ctx.piu_name}".upper()), cover_label))
        if ctx.consultant_name:
            story += [Paragraph("DPR CONSULTANT :", cover_label), Paragraph(esc(ctx.consultant_name.upper()), cover_text)]
        if ctx.association_name:
            story.append(Paragraph(esc(f"IN ASSOCIATION WITH {ctx.association_name}".upper()), cover_label))
        story += [Paragraph("Name of Work:", cover_label), Paragraph(esc((ctx.work_name or ctx.project_name).upper()), cover_text)]
        story.append(Paragraph("Inventory Survey Report", cover_title))
        if ctx.report_month:
            story.append(Paragraph(esc(ctx.report_month), cover_date))
        story.append(PageBreak())

        # ---- table of contents + list of tables -----------------------------------------
        story += [Paragraph("Table of Contents", h_toc), toc, Spacer(1, 0.6 * cm)]
        if records:
            story += [Paragraph("List of Tables", h_toc), table_list]
        story.append(PageBreak())

        # ---- 1 Introduction -------------------------------------------------------------
        background, visit = _intro_paragraphs(ctx, records)
        story.append(Paragraph("1 Introduction", h1))
        story.append(Paragraph("1.1 Project Background", h2))
        story += [Paragraph(esc(text), body) for text in background]
        story.append(Paragraph("1.2 Site Visit", h2))
        story += [Paragraph(esc(text), body) for text in visit]

        if records:
            rows = [[Paragraph(t, head_cell) for t in ("Sr No", "Chainage", "Type of Structure", "Name of River", "Span Arrangement", "Total Length")]]
            for number, record in enumerate(records, start=1):
                cells = [str(number), *summary_row(record)]
                rows.append([Paragraph(esc(c), data_cell) for c in cells])
            summary = Table(rows, colWidths=[1.4 * cm, 2.8 * cm, 4.6 * cm, 3.2 * cm, 3.0 * cm, 2.6 * cm], repeatRows=1)
            summary.setStyle(
                TableStyle(
                    [
                        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
                        ("BACKGROUND", (0, 0), (-1, 0), blue_header),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ]
                )
            )
            story.append(summary)
        else:
            story.append(Paragraph("No structures have been surveyed in this project yet.", note))

        # ---- structures --------------------------------------------------------------------
        for number, record in enumerate(records, start=1):
            chainage = record.chainage or "-"
            type_label = structure_type_label(record)
            story.append(PageBreak())
            story.append(Paragraph(esc(f"Table {number} {type_label} at Chainage Km {chainage}"), table_title))

            data = [[Paragraph("Sr. No.", head_cell), Paragraph("Description", head_cell), Paragraph("Data", head_cell)]]
            for i, (label, value) in enumerate(_response_rows(record, question_index), start=1):
                data.append([Paragraph(str(i), data_cell), Paragraph(esc(label), desc_cell), Paragraph(esc(value), data_cell)])
            table = Table(data, colWidths=[1.7 * cm, 9.3 * cm, 6.6 * cm], repeatRows=1)
            table.setStyle(
                TableStyle(
                    [
                        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
                        ("BACKGROUND", (0, 0), (-1, 0), blue_header),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ]
                )
            )
            story.append(table)

            for heading, key in (("Observations:", "observations"), ("Recommendations:", "recommendations")):
                items = bullet_items(record, key)
                if items:
                    story.append(Paragraph(heading, list_head))
                    story += [Paragraph(esc(text), bullet, bulletText="\u2022") for text in items]

            blobs = photo_blobs.get(record.id, [])
            if not blobs:
                story.append(Paragraph("No photographs available for this structure.", note))
                continue
            for start in range(0, len(blobs), 2):
                story.append(PageBreak())
                rows = [[Paragraph(f"<u>{esc(f'Chainage:- {chainage} {type_label.upper()}')}</u>", frame_head)]]
                for blob in blobs[start : start + 2]:
                    rows.append([PhotoCell(blob, 16.2 * cm, 10.6 * cm)])
                frame = Table(rows, colWidths=[17.6 * cm])
                frame.setStyle(
                    TableStyle(
                        [
                            ("BOX", (0, 0), (-1, -1), 0.7, colors.black),
                            ("LINEBELOW", (0, 0), (-1, -2), 0.7, colors.black),
                            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ]
                    )
                )
                story.append(frame)
        return story

    buffer = BytesIO()

    def make_doc(target: BytesIO) -> ReportDoc:
        doc = ReportDoc(
            target,
            pagesize=A4,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=margin,
            bottomMargin=margin,
            title=f"{footer_label} - Inventory Survey Report",
        )
        frame_box = Frame(margin, margin, A4[0] - 2 * margin, A4[1] - 2 * margin, id="body")
        doc.addPageTemplates([PageTemplate(id="report", frames=[frame_box], onPageEnd=draw_footer)])
        return doc

    # Pass 1..n: settle the contents page numbers with the photos left blank (cheap).
    render_mode["measure"] = True
    make_doc(BytesIO()).multiBuild(build_story(), maxPasses=8)
    # Final: the indexes already hold the right numbers, so this is a single real pass.
    render_mode["measure"] = False
    make_doc(buffer).multiBuild(build_story(), maxPasses=8)
    return buffer.getvalue()


async def load_records_for_report(db: AsyncSession, record_ids: list[UUID]) -> tuple[str, list[SurveyRecord]]:
    result = await db.execute(
        select(SurveyRecord)
        .where(SurveyRecord.id.in_(record_ids))
        .options(selectinload(SurveyRecord.photos), selectinload(SurveyRecord.project))
    )
    records = list(result.scalars().unique().all())
    # Preserve request order
    by_id = {r.id: r for r in records}
    ordered = sorted((by_id[i] for i in record_ids if i in by_id), key=_chainage_sort_key)
    project_name = ""
    if ordered:
        project = ordered[0].project
        if project is None and ordered[0].project_id:
            project = await db.get(Project, ordered[0].project_id)
        project_name = project.name if project else ""
    return project_name, ordered


async def load_question_index(db: AsyncSession) -> QuestionIndex:
    """Labels/order for every structure category, across all stored schema versions."""
    from app.models import QuestionnaireSchema

    rows = (await db.execute(select(QuestionnaireSchema.version, QuestionnaireSchema.schema_json))).all()
    return build_question_index([(version, schema_json or {}) for version, schema_json in rows])


async def load_report_context(db: AsyncSession, records: list[SurveyRecord]) -> ReportContext:
    """Project details + site-visit dates (first/last capture) for the cover and introduction."""
    project = None
    if records:
        project = records[0].project or await db.get(Project, records[0].project_id)
    stamps = [r.captured_at or r.created_at for r in records if (r.captured_at or r.created_at)]
    return ReportContext(
        project_name=project.name if project else "",
        client_name=getattr(project, "client_name", None),
        piu_name=getattr(project, "piu_name", None),
        consultant_name=getattr(project, "consultant_name", None),
        association_name=getattr(project, "association_name", None),
        work_name=getattr(project, "work_name", None),
        background_text=getattr(project, "background_text", None),
        visit_from=min(stamps).date() if stamps else None,
        visit_to=max(stamps).date() if stamps else None,
        report_month=datetime.now().strftime("%B-%Y").upper(),
    )
