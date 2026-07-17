"""Admin → Super Admin requests / suggestions."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models import AdminRequest, User, UserRole

router = APIRouter(prefix="/api/requests", tags=["requests"])

ALLOWED_CATEGORIES = {"question", "flow", "report_format", "other"}


class RequestCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1)


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_by: UUID
    category: str
    subject: str
    message: str
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    author_name: str | None = None
    author_email: str | None = None


class RequestStatusUpdate(BaseModel):
    status: str = Field(pattern="^(open|in_review|resolved|closed)$")


@router.post("", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    body: RequestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.super_admin)),
) -> RequestOut:
    category = body.category.strip().lower().replace(" ", "_")
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category must be question, flow, report_format, or other.",
        )
    row = AdminRequest(
        id=uuid4(),
        created_by=user.id,
        category=category,
        subject=body.subject.strip(),
        message=body.message.strip(),
        status="open",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return RequestOut(
        id=row.id,
        created_by=row.created_by,
        category=row.category,
        subject=row.subject,
        message=row.message,
        status=row.status,
        created_at=row.created_at,
        resolved_at=row.resolved_at,
        author_name=user.name,
        author_email=user.email,
    )


@router.get("", response_model=list[RequestOut])
async def list_requests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.super_admin)),
) -> list[RequestOut]:
    query = select(AdminRequest).order_by(AdminRequest.created_at.desc())
    if user.role == UserRole.admin:
        query = query.where(AdminRequest.created_by == user.id)
    rows = list((await db.execute(query)).scalars().all())
    author_ids = {r.created_by for r in rows}
    authors = {}
    if author_ids:
        users = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        authors = {u.id: u for u in users}
    return [
        RequestOut(
            id=r.id,
            created_by=r.created_by,
            category=r.category,
            subject=r.subject,
            message=r.message,
            status=r.status,
            created_at=r.created_at,
            resolved_at=r.resolved_at,
            author_name=authors.get(r.created_by).name if authors.get(r.created_by) else None,
            author_email=authors.get(r.created_by).email if authors.get(r.created_by) else None,
        )
        for r in rows
    ]


@router.patch("/{request_id}", response_model=RequestOut)
async def update_request_status(
    request_id: UUID,
    body: RequestStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> RequestOut:
    row = await db.scalar(select(AdminRequest).where(AdminRequest.id == request_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
    row.status = body.status
    if body.status in {"resolved", "closed"}:
        row.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(row)
    author = await db.scalar(select(User).where(User.id == row.created_by))
    return RequestOut(
        id=row.id,
        created_by=row.created_by,
        category=row.category,
        subject=row.subject,
        message=row.message,
        status=row.status,
        created_at=row.created_at,
        resolved_at=row.resolved_at,
        author_name=author.name if author else None,
        author_email=author.email if author else None,
    )
