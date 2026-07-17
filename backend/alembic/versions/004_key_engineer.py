"""004 project key engineer

Revision ID: 004_key_engineer
Revises: 003_report_templates
Create Date: 2026-07-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004_key_engineer"
down_revision: Union[str, None] = "003_report_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("key_engineer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column("projects", sa.Column("key_engineer_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "key_engineer_name")
    op.drop_column("projects", "key_engineer_id")
