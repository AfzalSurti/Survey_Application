"""Build the GDRPL work report (DOCX or PDF): Q&A page + photo pages per structure."""

from __future__ import annotations

import asyncio
import json
import logging
import re
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


_ROW_SKIP = SKIP_KEYS | {"chainage", "name_of_road"}


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
) -> bytes:
    """One project's inventory report: for every structure a titled table, then its photos.

    Layout follows the client's Inventory Survey Report: a blue-headed grid
    (Sr. No. | Description | Data) under "Table N <Structure> at Chainage Km X",
    then framed photo pages with two photos each under "Chainage:- X <STRUCTURE>".
    """
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        Image as RLImage,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    photo_blobs = photo_blobs or {}
    blue_header = colors.HexColor("#5AA0D8")
    title_blue = colors.HexColor("#2F6EBA")

    title_style = ParagraphStyle("TableTitle", fontName="Times-Bold", fontSize=13, leading=17,
                                 alignment=TA_CENTER, textColor=title_blue, spaceAfter=8, keepWithNext=1)
    head_style = ParagraphStyle("HeadCell", fontName="Times-Bold", fontSize=10.5, leading=13, alignment=TA_CENTER)
    desc_style = ParagraphStyle("DescCell", fontName="Times-Roman", fontSize=10, leading=12.5)
    data_style = ParagraphStyle("DataCell", fontName="Times-Roman", fontSize=10, leading=12.5, alignment=TA_CENTER)
    num_style = ParagraphStyle("NumCell", fontName="Times-Roman", fontSize=10, leading=12.5, alignment=TA_CENTER)
    frame_head = ParagraphStyle("FrameHead", fontName="Times-Bold", fontSize=11.5, leading=15, alignment=TA_CENTER)
    note_style = ParagraphStyle("Note", fontName="Times-Italic", fontSize=9.5, leading=12, spaceBefore=6)

    def esc(text: object) -> str:
        return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    story: list[Any] = []
    for number, record in enumerate(records, start=1):
        category = _category_label(record.structure_category)
        chainage = record.chainage or "—"
        if number > 1:
            story.append(PageBreak())
        story.append(Paragraph(esc(f"Table {number} {category} at Chainage Km {chainage}"), title_style))

        data = [[Paragraph("Sr. No.", head_style), Paragraph("Description", head_style), Paragraph("Data", head_style)]]
        for i, (label, value) in enumerate(_response_rows(record, question_index), start=1):
            data.append([Paragraph(str(i), num_style), Paragraph(esc(label), desc_style), Paragraph(esc(value), data_style)])
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

        blobs = photo_blobs.get(record.id, [])
        if not blobs:
            story.append(Paragraph("No photographs available for this structure.", note_style))
            continue

        for start in range(0, len(blobs), 2):
            story.append(PageBreak())
            rows: list[list[Any]] = [[Paragraph(f"<u>{esc(f'Chainage:- {chainage} {category.upper()}')}</u>", frame_head)]]
            for blob in blobs[start : start + 2]:
                try:
                    rows.append([RLImage(BytesIO(blob), width=16.2 * cm, height=10.6 * cm, kind="proportional")])
                except Exception:
                    rows.append([Paragraph("Photograph unavailable", note_style)])
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

    if not story:
        story.append(Paragraph("No structures in this project yet.", note_style))

    footer_label = f"{project_name}" if project_name else "GDRPL Survey"

    def draw_footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Times-Roman", 8.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(1.7 * cm, 0.9 * cm, footer_label[:90])
        canvas.drawRightString(A4[0] - 1.7 * cm, 0.9 * cm, f"Page {doc.page}")
        canvas.restoreState()

    buffer = BytesIO()
    SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=1.7 * cm,
        bottomMargin=1.7 * cm,
        leftMargin=1.7 * cm,
        rightMargin=1.7 * cm,
        title=f"{footer_label} - Inventory Survey Report",
    ).build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
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
