from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models import QuestionnaireSchema, SurveyModule, User


router = APIRouter(prefix="/api/schemas", tags=["schemas"])


class SchemaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module: SurveyModule
    version: int
    schema_json: dict
    is_active: bool

    @classmethod
    def from_orm_row(cls, row: QuestionnaireSchema) -> "SchemaOut":
        return cls(
            id=str(row.id),
            module=row.module,
            version=row.version,
            schema_json=row.schema_json,
            is_active=row.is_active,
        )


@router.get("/active")
async def get_active_schemas(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SchemaOut]:
    result = await db.execute(
        select(QuestionnaireSchema)
        .where(QuestionnaireSchema.is_active.is_(True))
        .order_by(QuestionnaireSchema.module, QuestionnaireSchema.version.desc())
    )
    rows = result.scalars().all()
    # One active per module (highest version if multiple flagged)
    seen: set[SurveyModule] = set()
    out: list[SchemaOut] = []
    for row in rows:
        if row.module in seen:
            continue
        seen.add(row.module)
        out.append(SchemaOut.from_orm_row(row))
    return out


@router.get("/{module}/active")
async def get_active_schema_for_module(
    module: SurveyModule,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SchemaOut:
    result = await db.execute(
        select(QuestionnaireSchema)
        .where(
            QuestionnaireSchema.module == module,
            QuestionnaireSchema.is_active.is_(True),
        )
        .order_by(QuestionnaireSchema.version.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active schema for module")
    return SchemaOut.from_orm_row(row)
