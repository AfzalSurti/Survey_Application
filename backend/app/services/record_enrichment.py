"""Helpers to enrich survey records with project / people display fields."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import PreSurveyEntry, Project, ProjectAssignment, SurveyRecord, SurveyStatus, User
from app.schemas.survey import SurveyRecordOut


def survey_type_label(category: str) -> str:
    return "Utility Survey" if "utility" in (category or "").lower() else "Structure Inventory Survey"


async def enrich_records(db: AsyncSession, records: list[SurveyRecord]) -> list[SurveyRecordOut]:
    if not records:
        return []

    project_ids = {r.project_id for r in records}
    surveyor_ids = {r.surveyor_id for r in records}

    projects = (
        await db.execute(
            select(Project).where(Project.id.in_(project_ids)).options(selectinload(Project.assignments))
        )
    ).scalars().all()
    project_map = {p.id: p for p in projects}

    users = (await db.execute(select(User).where(User.id.in_(surveyor_ids)))).scalars().all()
    user_map = {u.id: u for u in users}

    engineer_ids = {p.key_engineer_id for p in projects if p.key_engineer_id}
    if engineer_ids:
        engineers = (await db.execute(select(User).where(User.id.in_(engineer_ids)))).scalars().all()
        for e in engineers:
            user_map[e.id] = e

    pre_rows = (
        await db.execute(
            select(PreSurveyEntry)
            .where(PreSurveyEntry.project_id.in_(project_ids))
            .order_by(PreSurveyEntry.created_at.desc())
        )
    ).scalars().all()
    pre_by_project: dict[UUID, PreSurveyEntry] = {}
    for row in pre_rows:
        pre_by_project.setdefault(row.project_id, row)

    assign_map: dict[tuple[UUID, UUID], ProjectAssignment] = {}
    assigns = (
        await db.execute(
            select(ProjectAssignment).where(
                ProjectAssignment.project_id.in_(project_ids),
                ProjectAssignment.surveyor_id.in_(surveyor_ids),
            )
        )
    ).scalars().all()
    for a in assigns:
        assign_map[(a.project_id, a.surveyor_id)] = a

    out: list[SurveyRecordOut] = []
    for record in records:
        project = project_map.get(record.project_id)
        surveyor = user_map.get(record.surveyor_id)
        pre = pre_by_project.get(record.project_id)
        assignment = assign_map.get((record.project_id, record.surveyor_id))
        key_name = None
        if project:
            key_name = project.key_engineer_name
            if not key_name and project.key_engineer_id:
                eng = user_map.get(project.key_engineer_id)
                key_name = eng.name if eng else None

        head = pre.head_surveyor_name if pre else (surveyor.name if surveyor else None)
        complete = record.updated_at if record.status == SurveyStatus.approved else None

        base = SurveyRecordOut.model_validate(record)
        out.append(
            base.model_copy(
                update={
                    "project_name": project.name if project else None,
                    "project_number": project.project_number if project else None,
                    "survey_type": survey_type_label(record.structure_category),
                    "key_engineer_name": key_name,
                    "head_surveyor_name": head,
                    "assign_date": assignment.assigned_at if assignment else (project.created_at if project else None),
                    "complete_date": complete,
                }
            )
        )
    return out
