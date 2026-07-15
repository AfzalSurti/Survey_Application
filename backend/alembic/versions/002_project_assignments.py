"""002 project assignments

Revision ID: 002_project_assignments
Revises: 001_initial
Create Date: 2026-07-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002_project_assignments"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "surveyor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("assigned_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("project_id", "surveyor_id", name="uq_project_surveyor"),
    )
    op.create_index("ix_project_assignments_surveyor_id", "project_assignments", ["surveyor_id"])
    op.create_index("ix_project_assignments_project_id", "project_assignments", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_assignments_project_id", table_name="project_assignments")
    op.drop_index("ix_project_assignments_surveyor_id", table_name="project_assignments")
    op.drop_table("project_assignments")
