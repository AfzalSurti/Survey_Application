"""Report DOCX template upload and management (super admin)."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models import ReportTemplate, User, UserRole

router = APIRouter(prefix="/api/templates", tags=["templates"])
TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "uploads" / "templates"
DEFAULT_TEMPLATE = Path(__file__).resolve().parents[2] / "templates" / "structure_inventory_report.docx"
MAX_BYTES = 8 * 1024 * 1024  # 8 MB


def _module_str(value: object) -> str:
    return str(value.value if hasattr(value, "value") else value)


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    module: str
    is_active: bool
    created_at: object | None = None
    file_name: str | None = None
    has_file: bool = True
    is_builtin: bool = False


def _file_name_from_path(path: str) -> str:
    return Path(path).name


def _to_out(row: ReportTemplate, *, is_builtin: bool = False) -> TemplateOut:
    return TemplateOut(
        id=row.id,
        name=row.name,
        module=_module_str(row.module),
        is_active=row.is_active,
        created_at=row.created_at,
        file_name=_file_name_from_path(row.template_docx_path),
        has_file=bool(row.docx_bytes) or Path(row.template_docx_path).is_file(),
        is_builtin=is_builtin,
    )


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin, UserRole.admin)),
) -> list[TemplateOut]:
    rows = list((await db.execute(select(ReportTemplate).order_by(ReportTemplate.created_at.desc()))).scalars().all())
    items = [_to_out(r) for r in rows]
    # Surface the bundled default so admins know what is used when nothing is uploaded.
    if DEFAULT_TEMPLATE.is_file() and not any(i.name == "Built-in default (structure inventory)" for i in items):
        items.append(
            TemplateOut(
                id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                name="Built-in default (structure inventory)",
                module="structure_inventory",
                is_active=not any(r.is_active for r in rows if _module_str(r.module) == "structure_inventory"),
                created_at=None,
                file_name=DEFAULT_TEMPLATE.name,
                has_file=True,
                is_builtin=True,
            )
        )
    return items


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def upload_template(
    module: str = Form(...),
    name: str = Form(...),
    activate: bool = Form(True),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.super_admin)),
) -> TemplateOut:
    module_key = module.strip().lower().replace(" ", "_")
    if not module_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Module is required.",
        )

    display_name = name.strip()
    if not display_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Template name is required.")
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Choose a .docx file to upload.")
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only .docx Word templates are supported.",
        )

    raw = await file.read()
    await file.close()
    if not raw:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Uploaded file is empty.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Template is too large (max 8 MB).",
        )
    # Basic ZIP/DOCX signature
    if raw[:2] != b"PK":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File does not look like a valid .docx document.",
        )

    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name
    local_path = TEMPLATES_DIR / f"{uuid.uuid4()}_{safe_name}"
    local_path.write_bytes(raw)

    if activate:
        await db.execute(
            update(ReportTemplate)
            .where(ReportTemplate.module == module_key)
            .values(is_active=False)
        )

    row = ReportTemplate(
        name=display_name,
        module=module_key,
        template_docx_path=str(local_path),
        docx_bytes=raw,
        is_active=activate,
        created_by=user.id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _to_out(row)


@router.post("/{template_id}/activate", response_model=TemplateOut)
async def activate_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> TemplateOut:
    if str(template_id) == "00000000-0000-0000-0000-000000000001":
        # Activate built-in = deactivate all custom structure templates
        await db.execute(
            update(ReportTemplate)
            .where(ReportTemplate.module == "structure_inventory")
            .values(is_active=False)
        )
        await db.flush()
        return TemplateOut(
            id=template_id,
            name="Built-in default (structure inventory)",
            module="structure_inventory",
            is_active=True,
            file_name=DEFAULT_TEMPLATE.name,
            has_file=DEFAULT_TEMPLATE.is_file(),
            is_builtin=True,
        )

    row = await db.scalar(select(ReportTemplate).where(ReportTemplate.id == template_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")

    await db.execute(
        update(ReportTemplate).where(ReportTemplate.module == row.module).values(is_active=False)
    )
    row.is_active = True
    await db.flush()
    await db.refresh(row)
    return _to_out(row)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> None:
    if str(template_id) == "00000000-0000-0000-0000-000000000001":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The built-in default template cannot be deleted.",
        )
    row = await db.scalar(select(ReportTemplate).where(ReportTemplate.id == template_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
    if row.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Activate another template first, then delete this one. The active template cannot be removed.",
        )
    path = Path(row.template_docx_path)
    await db.delete(row)
    await db.flush()
    if path.is_file() and "uploads" in str(path):
        path.unlink(missing_ok=True)


@router.get("/{template_id}/download")
async def download_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin, UserRole.admin)),
) -> Response:
    if str(template_id) == "00000000-0000-0000-0000-000000000001":
        if not DEFAULT_TEMPLATE.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Built-in template file is missing on the server.")
        data = DEFAULT_TEMPLATE.read_bytes()
        filename = DEFAULT_TEMPLATE.name
    else:
        row = await db.scalar(select(ReportTemplate).where(ReportTemplate.id == template_id))
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
        if row.docx_bytes:
            data = row.docx_bytes
        elif Path(row.template_docx_path).is_file():
            data = Path(row.template_docx_path).read_bytes()
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template file is missing. Re-upload the .docx file.",
            )
        filename = _file_name_from_path(row.template_docx_path) or f"{row.name}.docx"

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def resolve_template_bytes(db: AsyncSession, module: str | None = None) -> tuple[bytes | None, Path | None]:
    """Return DOCX bytes and/or a filesystem path for report generation."""

    async def _from_row(row: ReportTemplate | None) -> tuple[bytes | None, Path | None]:
        if row is None:
            return None, None
        if row.docx_bytes:
            path = Path(row.template_docx_path)
            return row.docx_bytes, path if path.is_file() else None
        path = Path(row.template_docx_path)
        if path.is_file():
            return path.read_bytes(), path
        return None, None

    if module is not None:
        module_key = str(module.value if hasattr(module, "value") else module)
        row = await db.scalar(
            select(ReportTemplate)
            .where(ReportTemplate.is_active.is_(True), ReportTemplate.module == module_key)
            .order_by(ReportTemplate.created_at.desc())
            .limit(1)
        )
        data, path = await _from_row(row)
        if data or path:
            return data, path

    row = await db.scalar(
        select(ReportTemplate)
        .where(ReportTemplate.is_active.is_(True))
        .order_by(ReportTemplate.created_at.desc())
        .limit(1)
    )
    data, path = await _from_row(row)
    if data or path:
        return data, path
    if DEFAULT_TEMPLATE.is_file():
        return DEFAULT_TEMPLATE.read_bytes(), DEFAULT_TEMPLATE
    return None, None


def write_temp_docx(data: bytes) -> str:
    tmp = tempfile.NamedTemporaryFile(prefix="gdrpl-tpl-", suffix=".docx", delete=False)
    tmp.write(data)
    tmp.close()
    return tmp.name
