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
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Survey Records"
    sheet.append(
        [
            "Record ID",
            "Project ID",
            "Surveyor ID",
            "Chainage",
            "Structure Category",
            "Schema Version",
            "Latitude",
            "Longitude",
            "Captured At",
            "Status",
            "Sync Status",
            "Sheets Row ID",
            "Responses",
        ]
    )
    for record in result.scalars():
        sheet.append(
            [
                str(record.id),
                str(record.project_id),
                str(record.surveyor_id),
                record.chainage,
                record.structure_category,
                record.schema_version,
                float(record.latitude) if record.latitude is not None else None,
                float(record.longitude) if record.longitude is not None else None,
                record.captured_at.isoformat() if record.captured_at else None,
                record.status.value,
                record.sync_status.value,
                record.sheets_row_id,
                str(record.responses_json),
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
