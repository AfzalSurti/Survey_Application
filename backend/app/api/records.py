from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Project, SurveyRecord, SurveyStatus, User, UserRole
from app.schemas.survey import (
    DashboardSummary,
    SurveyRecordDataUpdate,
    SurveyRecordOut,
    SurveyRecordPage,
    SurveyRecordStatusUpdate,
)
from app.services.record_enrichment import enrich_records


router = APIRouter(prefix="/api/records", tags=["records"])


def _record_filters(
    project_id: UUID | None,
    chainage: str | None,
    structure_category: str | None,
    record_status: SurveyStatus | None,
    surveyor_id: UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
    user: User,
) -> list:
    filters = []
    if user.role == UserRole.surveyor:
        filters.append(SurveyRecord.surveyor_id == user.id)
    elif surveyor_id is not None:
        filters.append(SurveyRecord.surveyor_id == surveyor_id)
    if project_id is not None:
        filters.append(SurveyRecord.project_id == project_id)
    if chainage:
        filters.append(SurveyRecord.chainage.ilike(f"%{chainage}%"))
    if structure_category:
        filters.append(SurveyRecord.structure_category == structure_category)
    if record_status is not None:
        filters.append(SurveyRecord.status == record_status)
    if date_from is not None:
        filters.append(SurveyRecord.captured_at >= date_from)
    if date_to is not None:
        filters.append(SurveyRecord.captured_at <= date_to)
    return filters


@router.get("/dashboard", response_model=DashboardSummary)
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardSummary:
    filters = _record_filters(None, None, None, None, None, None, None, user)
    result = await db.execute(
        select(SurveyRecord).where(*filters).order_by(SurveyRecord.updated_at.desc())
    )
    records = list(result.scalars().all())
    enriched = await enrich_records(db, records)
    complete = [r for r in enriched if r.status == SurveyStatus.approved]
    ongoing = [r for r in enriched if r.status in {SurveyStatus.submitted, SurveyStatus.draft}]
    total_projects = await db.scalar(select(func.count()).select_from(Project)) or 0
    return DashboardSummary(
        total_projects=total_projects,
        complete_surveys=len(complete),
        ongoing_surveys=len(ongoing),
        complete_items=complete[:25],
        pending_items=ongoing[:25],
    )


@router.get("", response_model=SurveyRecordPage)
async def list_records(
    project_id: UUID | None = None,
    chainage: str | None = None,
    structure_category: str | None = None,
    status: SurveyStatus | None = None,
    surveyor_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyRecordPage:
    filters = _record_filters(
        project_id, chainage, structure_category, status, surveyor_id, date_from, date_to, user
    )
    total = await db.scalar(select(func.count()).select_from(SurveyRecord).where(*filters))
    result = await db.execute(
        select(SurveyRecord)
        .where(*filters)
        .order_by(SurveyRecord.captured_at.desc(), SurveyRecord.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = await enrich_records(db, list(result.scalars().all()))
    return SurveyRecordPage(
        items=items,
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.get("/{record_id}", response_model=SurveyRecordOut)
async def get_record(
    record_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyRecordOut:
    result = await db.execute(select(SurveyRecord).where(SurveyRecord.id == record_id))
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey record not found")
    if user.role == UserRole.surveyor and record.surveyor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Record belongs to another surveyor")
    enriched = await enrich_records(db, [record])
    return enriched[0]


@router.patch("/{record_id}/status", response_model=SurveyRecordOut)
async def update_record_status(
    record_id: UUID,
    body: SurveyRecordStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin, UserRole.super_admin)),
) -> SurveyRecordOut:
    if body.status not in {SurveyStatus.approved, SurveyStatus.rejected}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status must be approved or rejected",
        )
    result = await db.execute(select(SurveyRecord).where(SurveyRecord.id == record_id))
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey record not found")
    record.status = body.status
    await db.flush()
    await db.refresh(record)
    return (await enrich_records(db, [record]))[0]


@router.patch("/{record_id}", response_model=SurveyRecordOut)
async def correct_record_data(
    record_id: UUID,
    body: SurveyRecordDataUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin, UserRole.super_admin)),
) -> SurveyRecordOut:
    """Correct survey answer data. Does not change questionnaire schema/architecture."""
    result = await db.execute(select(SurveyRecord).where(SurveyRecord.id == record_id))
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey record not found")

    if body.chainage is not None:
        record.chainage = body.chainage
    if body.structure_category is not None:
        record.structure_category = body.structure_category
    if body.responses_json is not None:
        record.responses_json = body.responses_json
    if body.latitude is not None:
        record.latitude = body.latitude
    if body.longitude is not None:
        record.longitude = body.longitude
    if body.captured_at is not None:
        record.captured_at = body.captured_at
    if body.status is not None:
        record.status = body.status

    await db.flush()
    await db.refresh(record)
    return (await enrich_records(db, [record]))[0]
