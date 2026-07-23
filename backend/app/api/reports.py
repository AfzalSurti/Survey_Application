import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.database import get_db
from app.models import SurveyPhoto, SurveyRecord, User, UserRole
from app.schemas.survey import GenerateReportRequest, SurveyPhotoOut
from app.services.work_report import build_work_report_docx, load_records_for_report


router = APIRouter(prefix="/api/reports", tags=["reports"])


def _remove_file(path: str) -> None:
    Path(path).unlink(missing_ok=True)


@router.post("/generate")
async def generate_report(
    body: GenerateReportRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    project_name, records = await load_records_for_report(db, body.record_ids)
    if len(records) != len(set(body.record_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more survey records were not found")
    if user.role == UserRole.surveyor and any(record.surveyor_id != user.id for record in records):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot report on another surveyor's records")

    docx_bytes = build_work_report_docx(project_name=project_name, records=records)
    output = tempfile.NamedTemporaryFile(prefix="gdrpl-work-report-", suffix=".docx", delete=False)
    output.write(docx_bytes)
    output.close()

    safe_name = (project_name or "gdrpl-survey").replace(" ", "-")[:60]
    background_tasks.add_task(_remove_file, output.name)
    return FileResponse(
        output.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{safe_name}-work-report.docx",
        background=background_tasks,
    )


@router.get("/records/{record_id}/photos", response_model=list[SurveyPhotoOut])
async def list_record_photos(
    record_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SurveyPhoto]:
    record = await db.get(SurveyRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    if user.role == UserRole.surveyor and record.surveyor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    result = await db.execute(
        select(SurveyPhoto).where(SurveyPhoto.survey_record_id == record_id).order_by(SurveyPhoto.created_at)
    )
    return list(result.scalars().all())


@router.get("/photos/{photo_id}/file")
async def download_photo_file(
    photo_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    photo = await db.scalar(
        select(SurveyPhoto)
        .where(SurveyPhoto.id == photo_id)
        .options(selectinload(SurveyPhoto.survey_record))
    )
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    record = photo.survey_record
    if user.role == UserRole.surveyor and record and record.surveyor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    path = Path(photo.local_path)
    if not path.is_file():
        if photo.drive_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Local photo file missing; open drive_url from photo metadata instead.",
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo file not found on server")
    return FileResponse(path, filename=photo.file_name or path.name)
