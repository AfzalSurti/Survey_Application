from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.core.security import hash_password
from app.database import get_db
from app.models import Project, ProjectAssignment, User, UserRole
from app.schemas.auth import UserCreate, UserOut, UserUpdate


router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreateWithProjects(UserCreate):
    project_ids: list[UUID] = Field(default_factory=list)


async def _assign_projects(
    db: AsyncSession, surveyor_id: UUID, project_ids: list[UUID], assigned_by: UUID
) -> None:
    unique = list(dict.fromkeys(project_ids))
    if not unique:
        return
    projects = (await db.execute(select(Project).where(Project.id.in_(unique)))).scalars().all()
    found = {p.id for p in projects}
    missing = [str(i) for i in unique if i not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown projects: {', '.join(missing)}",
        )
    existing = (
        await db.execute(select(ProjectAssignment).where(ProjectAssignment.surveyor_id == surveyor_id))
    ).scalars().all()
    already = {a.project_id for a in existing}
    for pid in unique:
        if pid not in already:
            db.add(
                ProjectAssignment(
                    id=uuid4(),
                    project_id=pid,
                    surveyor_id=surveyor_id,
                    assigned_by=assigned_by,
                )
            )


@router.get("", response_model=list[UserOut])
async def list_users(
    role: UserRole | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> list[User]:
    query = select(User).order_by(User.created_at.desc())
    if role is not None:
        query = query.where(User.role == role)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreateWithProjects,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.super_admin)),
) -> User:
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        name=body.name,
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role=body.role,
        organization=body.organization,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    # Field (surveyor), Admin, and Super Admin may be assigned to projects for field work.
    if body.project_ids and body.role in {UserRole.surveyor, UserRole.admin, UserRole.super_admin}:
        await _assign_projects(db, user.id, body.project_ids, actor.id)
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        user.role = body.role
    if body.organization is not None:
        user.organization = body.organization
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.password_hash = hash_password(body.password)

    await db.flush()
    await db.refresh(user)
    return user
