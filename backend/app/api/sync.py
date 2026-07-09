import shutil
import uuid
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models import AppSetting, Project, SurveyPhoto, SurveyRecord, SyncStatus, User, UserRole
from app.schemas.survey import SyncSurveyRecordRequest, SyncSurveyRecordResponse, SurveyPhotoOut
from app.services.google_drive import upload_photo
from app.services.google_sheets import append_or_update_record


router = APIRouter(prefix="/api/sync", tags=["sync"])
UPLOADS_DIR = Path(__file__).resolve().parents[2] / "uploads"


async def _setting_value(db: AsyncSession, key: str) -> dict[str, Any]:
    setting = await db.scalar(select(AppSetting).where(AppSetting.key == key))
    return setting.value_json if setting else {}


async def _get_project(
    body: SyncSurveyRecordRequest, db: AsyncSession, user: User
) -> Project:
    if body.project_id is not None:
        project = await db.scalar(select(Project).where(Project.id == body.project_id))
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project
    if body.project_number is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="project_id or project_number is required",
        )
    project = await db.scalar(
        select(Project).where(Project.project_number == body.project_number).order_by(Project.created_at)
    )
    if project is not None:
        return project
    if not body.project_name or not body.highway_number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="project_name and highway_number are required for a new project",
        )
    project = Project(
        name=body.project_name,
        project_number=body.project_number,
        highway_number=body.highway_number,
        created_by=user.id,
    )
    db.add(project)
    await db.flush()
    return project


@router.post("/survey-records", response_model=SyncSurveyRecordResponse)
async def sync_survey_record(
    body: SyncSurveyRecordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SyncSurveyRecordResponse:
    project = await _get_project(body, db, user)
    record = await db.scalar(
        select(SurveyRecord).where(
            SurveyRecord.project_id == project.id,
            SurveyRecord.chainage == body.chainage,
        )
    )
    created = record is None
    if record is None:
        record = SurveyRecord(
            project_id=project.id,
            surveyor_id=user.id,
            structure_category=body.structure_category,
            chainage=body.chainage,
            schema_version=body.schema_version,
            responses_json=body.responses_json,
            latitude=body.latitude,
            longitude=body.longitude,
            captured_at=body.captured_at,
        )
        db.add(record)
    else:
        if user.role == UserRole.surveyor and record.surveyor_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Record belongs to another surveyor")
        record.structure_category = body.structure_category
        record.schema_version = body.schema_version
        record.responses_json = body.responses_json
        record.latitude = body.latitude
        record.longitude = body.longitude
        record.captured_at = body.captured_at
    await db.flush()

    sheet_settings = await _setting_value(db, "google_sheets")
    record.sheets_row_id = await append_or_update_record(
        chainage=record.chainage,
        values=[
            record.chainage,
            project.project_number,
            record.structure_category,
            record.status.value,
            str(record.surveyor_id),
        ],
        settings=sheet_settings,
    )
    record.sync_status = SyncStatus.synced
    await db.flush()
    await db.refresh(record)
    return SyncSurveyRecordResponse(id=record.id, sheets_row_id=record.sheets_row_id, created=created)


@router.post("/photos", response_model=SurveyPhotoOut, status_code=status.HTTP_201_CREATED)
async def sync_photo(
    survey_record_id: UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyPhoto:
    record = await db.scalar(select(SurveyRecord).where(SurveyRecord.id == survey_record_id))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey record not found")
    if user.role == UserRole.surveyor and record.surveyor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Record belongs to another surveyor")
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Photo filename is required")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name
    local_path = UPLOADS_DIR / f"{uuid.uuid4()}_{safe_name}"
    with local_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)
    try:
        drive_settings = await _setting_value(db, "google_drive")
        drive_file_id, drive_url = await upload_photo(local_path, settings=drive_settings)
    finally:
        await file.close()

    photo = SurveyPhoto(
        survey_record_id=record.id,
        file_name=safe_name,
        local_path=str(local_path),
        drive_file_id=drive_file_id,
        drive_url=drive_url,
        sync_status=SyncStatus.synced,
    )
    db.add(photo)
    await db.flush()
    await db.refresh(photo)
    return photo
