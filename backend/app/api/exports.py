from datetime import datetime
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.records import _record_filters
from app.core.deps import get_current_user
from app.database import get_db
from app.models import SurveyRecord, SurveyStatus, User
from app.services.record_enrichment import enrich_records


router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.get("/excel")
async def export_excel(
    project_id: UUID | None = None,
    chainage: str | None = None,
    structure_category: str | None = None,
    status: SurveyStatus | None = None,
    surveyor_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    filters = _record_filters(
        project_id, chainage, structure_category, status, surveyor_id, date_from, date_to, user
    )
    result = await db.execute(
        select(SurveyRecord).where(*filters).order_by(SurveyRecord.captured_at.desc())
    )
    enriched = await enrich_records(db, list(result.scalars().all()))
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Survey Records"
    sheet.append(
        [
            "Project Name",
            "Project No.",
            "Survey Type",
            "Key Person / Highway Engineer",
            "Head Survey Person",
            "Assign Date",
            "Complete Date",
            "Chainage",
            "Category",
            "Status",
            "Captured At",
        ]
    )
    for record in enriched:
        sheet.append(
            [
                record.project_name,
                record.project_number,
                record.survey_type,
                record.key_engineer_name,
                record.head_surveyor_name,
                record.assign_date.isoformat() if record.assign_date else None,
                record.complete_date.isoformat() if record.complete_date else None,
                record.chainage,
                record.structure_category,
                record.status.value,
                record.captured_at.isoformat() if record.captured_at else None,
            ]
        )
    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="gdrpl-survey-records.xlsx"'},
    )
