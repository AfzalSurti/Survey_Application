from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models import PreSurveyEntry, Project, ProjectAssignment, User, UserRole
from app.schemas.survey import (
    PreSurveyEntryCreate,
    PreSurveyEntryOut,
    ProjectAssignRequest,
    ProjectCreate,
    ProjectOut,
)


router = APIRouter(prefix="/api", tags=["projects"])


def _project_out(project: Project) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        project_number=project.project_number,
        highway_number=project.highway_number,
        created_by=project.created_by,
        created_at=project.created_at,
        surveyor_ids=[a.surveyor_id for a in (project.assignments or [])],
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
            await db.execute(select(User).where(User.id.in_(unique_ids), User.role == UserRole.surveyor))
        ).scalars().all()
        found = {u.id for u in users}
        missing = [str(i) for i in unique_ids if i not in found]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Surveyor user(s) not found: {', '.join(missing)}",
            )
    # clear existing
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
    project = Project(
        name=body.name,
        project_number=body.project_number,
        highway_number=body.highway_number,
        created_by=user.id,
    )
    db.add(project)
    await db.flush()
    project = await _load_project(db, project.id)
    assert project is not None
    if body.surveyor_ids:
        await _replace_assignments(db, project, body.surveyor_ids, user.id)
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
            detail="Surveyor is not assigned to this project",
        )
    entry = PreSurveyEntry(**body.model_dump(), surveyor_id=user.id)
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry
