from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models import PreSurveyEntry, Project, User
from app.schemas.survey import (
    PreSurveyEntryCreate,
    PreSurveyEntryOut,
    ProjectCreate,
    ProjectOut,
)


router = APIRouter(prefix="/api", tags=["projects"])


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = Project(**body.model_dump(), created_by=user.id)
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project


@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Project]:
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return list(result.scalars().all())


@router.post("/pre-survey", response_model=PreSurveyEntryOut, status_code=status.HTTP_201_CREATED)
async def create_pre_survey_entry(
    body: PreSurveyEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PreSurveyEntry:
    project = await db.scalar(select(Project).where(Project.id == body.project_id))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    entry = PreSurveyEntry(**body.model_dump(), surveyor_id=user.id)
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry
