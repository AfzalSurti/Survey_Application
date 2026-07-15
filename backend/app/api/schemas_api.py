from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models import QuestionnaireSchema, SurveyModule, User, UserRole
from app.schemas.survey import QuestionnaireSchemaActivation, QuestionnaireSchemaCreate


router = APIRouter(prefix="/api/schemas", tags=["schemas"])


class SchemaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

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


@router.get("", response_model=list[SchemaOut])
async def list_schemas(
    module: SurveyModule | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SchemaOut]:
    query = select(QuestionnaireSchema)
    if module is not None:
        query = query.where(QuestionnaireSchema.module == module)
    result = await db.execute(query.order_by(QuestionnaireSchema.module, QuestionnaireSchema.version.desc()))
    return [SchemaOut.from_orm_row(row) for row in result.scalars().all()]


@router.post("", response_model=SchemaOut, status_code=status.HTTP_201_CREATED)
async def create_schema_version(
    body: QuestionnaireSchemaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.super_admin)),
) -> SchemaOut:
    version = body.version
    if version is None:
        latest = await db.scalar(
            select(QuestionnaireSchema.version)
            .where(QuestionnaireSchema.module == body.module)
            .order_by(QuestionnaireSchema.version.desc())
            .limit(1)
        )
        version = (latest or 0) + 1
    existing = await db.scalar(
        select(QuestionnaireSchema).where(
            QuestionnaireSchema.module == body.module,
            QuestionnaireSchema.version == version,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Schema version already exists")
    if body.is_active:
        active = await db.execute(
            select(QuestionnaireSchema).where(
                QuestionnaireSchema.module == body.module,
                QuestionnaireSchema.is_active.is_(True),
            )
        )
        for row in active.scalars():
            row.is_active = False
    schema = QuestionnaireSchema(
        module=body.module,
        version=version,
        schema_json=body.schema_json,
        is_active=body.is_active,
        created_by=user.id,
    )
    db.add(schema)
    await db.flush()
    await db.refresh(schema)
    return SchemaOut.from_orm_row(schema)


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


@router.patch("/{schema_id}", response_model=SchemaOut)
async def set_schema_active(
    schema_id: UUID,
    body: QuestionnaireSchemaActivation,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> SchemaOut:
    schema = await db.scalar(select(QuestionnaireSchema).where(QuestionnaireSchema.id == schema_id))
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema not found")
    if body.is_active:
        active = await db.execute(
            select(QuestionnaireSchema).where(
                QuestionnaireSchema.module == schema.module,
                QuestionnaireSchema.is_active.is_(True),
                QuestionnaireSchema.id != schema.id,
            )
        )
        for row in active.scalars():
            row.is_active = False
    schema.is_active = body.is_active
    await db.flush()
    await db.refresh(schema)
    return SchemaOut.from_orm_row(schema)
