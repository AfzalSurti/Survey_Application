from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models import PreSurveyEntry, Project, ProjectAssignment, SurveyPhoto, SurveyRecord, User, UserRole
from app.schemas.survey import (
    PreSurveyEntryCreate,
    PreSurveyEntryOut,
    ProjectAssignRequest,
    ProjectCreate,
    ProjectOut,
)

# Field workers may be surveyors (Field), admins, or super admins.
FIELD_ROLES = {UserRole.surveyor, UserRole.admin, UserRole.super_admin}

router = APIRouter(prefix="/api", tags=["projects"])


def _project_out(project: Project) -> ProjectOut:
    assign_dates = [a.assigned_at for a in (project.assignments or []) if a.assigned_at]
    return ProjectOut(
        id=project.id,
        name=project.name,
        project_number=project.project_number,
        highway_number=project.highway_number,
        key_engineer_id=project.key_engineer_id,
        key_engineer_name=project.key_engineer_name,
        created_by=project.created_by,
        created_at=project.created_at,
        surveyor_ids=[a.surveyor_id for a in (project.assignments or [])],
        assign_date=min(assign_dates) if assign_dates else project.created_at,
    )


async def _load_project(db: AsyncSession, project_id: UUID) -> Project | None:
    return await db.scalar(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.assignments))
    )


async def _replace_assignments(
    db: AsyncSession,
    project: Project,
    surveyor_ids: list[UUID],
    assigned_by: UUID,
) -> None:
    unique_ids = list(dict.fromkeys(surveyor_ids))
    if unique_ids:
        users = (
            await db.execute(select(User).where(User.id.in_(unique_ids), User.role.in_(FIELD_ROLES)))
        ).scalars().all()
        found = {u.id for u in users}
        missing = [str(i) for i in unique_ids if i not in found]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field user(s) not found: {', '.join(missing)}. Assign Super Admin, Admin, or Field users.",
            )
    for assignment in list(project.assignments or []):
        await db.delete(assignment)
    await db.flush()
    for sid in unique_ids:
        db.add(
            ProjectAssignment(
                id=uuid4(),
                project_id=project.id,
                surveyor_id=sid,
                assigned_by=assigned_by,
            )
        )
    await db.flush()


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.super_admin)),
) -> ProjectOut:
    number = body.project_number.strip()
    name = body.name.strip()
    highway = body.highway_number.strip()
    if not name or not number or not highway:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Project name, project number, and highway number are required.",
        )

    # Prevent accidental duplicates from retries / double-clicks.
    existing = await db.scalar(select(Project).where(Project.project_number == number))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A project with number “{number}” already exists. Use a different number or delete the old project first.",
        )

    key_name = body.key_engineer_name
    if body.key_engineer_id and not key_name:
        eng = await db.scalar(select(User).where(User.id == body.key_engineer_id))
        if eng is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Key engineer not found.")
        key_name = eng.name

    # Auto-include creating user as field assignee when no surveyors passed (logged-in email flow).
    surveyor_ids = list(body.surveyor_ids)
    if not surveyor_ids:
        surveyor_ids = [user.id]

    project = Project(
        name=name,
        project_number=number,
        highway_number=highway,
        key_engineer_id=body.key_engineer_id,
        key_engineer_name=key_name,
        created_by=user.id,
    )
    db.add(project)
    await db.flush()
    project = await _load_project(db, project.id)
    assert project is not None
    await _replace_assignments(db, project, surveyor_ids, user.id)
    project = await _load_project(db, project.id)
    assert project is not None
    return _project_out(project)


@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProjectOut]:
    query = select(Project).options(selectinload(Project.assignments)).order_by(Project.created_at.desc())
    if user.role == UserRole.surveyor:
        query = query.join(ProjectAssignment).where(ProjectAssignment.surveyor_id == user.id)
    result = await db.execute(query)
    projects = result.scalars().unique().all()
    return [_project_out(p) for p in projects]


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectOut:
    project = await _load_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if user.role == UserRole.surveyor and user.id not in {a.surveyor_id for a in project.assignments}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not assigned to this project")
    return _project_out(project)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> None:
    project = await _load_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    record_ids = list(
        (await db.execute(select(SurveyRecord.id).where(SurveyRecord.project_id == project_id))).scalars().all()
    )
    if record_ids:
        photos = (
            await db.execute(select(SurveyPhoto).where(SurveyPhoto.survey_record_id.in_(record_ids)))
        ).scalars().all()
        for photo in photos:
            await db.delete(photo)
        await db.flush()
        records = (
            await db.execute(select(SurveyRecord).where(SurveyRecord.id.in_(record_ids)))
        ).scalars().all()
        for record in records:
            await db.delete(record)
        await db.flush()

    pre_entries = (
        await db.execute(select(PreSurveyEntry).where(PreSurveyEntry.project_id == project_id))
    ).scalars().all()
    for entry in pre_entries:
        await db.delete(entry)
    await db.flush()

    await db.delete(project)
    await db.flush()


@router.put("/projects/{project_id}/assignments", response_model=ProjectOut)
async def assign_surveyors(
    project_id: UUID,
    body: ProjectAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.super_admin)),
) -> ProjectOut:
    project = await _load_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    await _replace_assignments(db, project, body.surveyor_ids, user.id)
    project = await _load_project(db, project_id)
    assert project is not None
    return _project_out(project)


@router.post("/pre-survey", response_model=PreSurveyEntryOut, status_code=status.HTTP_201_CREATED)
async def create_pre_survey_entry(
    body: PreSurveyEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PreSurveyEntry:
    project = await _load_project(db, body.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if user.role == UserRole.surveyor and user.id not in {a.surveyor_id for a in project.assignments}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this project",
        )
    entry = PreSurveyEntry(**body.model_dump(), surveyor_id=user.id)
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry
