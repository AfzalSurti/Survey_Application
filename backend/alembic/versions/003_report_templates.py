"""003 report template name and bytes

Revision ID: 003_report_templates
Revises: 002_project_assignments
Create Date: 2026-07-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_report_templates"
down_revision: Union[str, None] = "002_project_assignments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "report_templates",
        sa.Column("name", sa.String(length=255), nullable=False, server_default="Untitled template"),
    )
    op.add_column("report_templates", sa.Column("docx_bytes", sa.LargeBinary(), nullable=True))
    op.alter_column("report_templates", "name", server_default=None)


def downgrade() -> None:
    op.drop_column("report_templates", "docx_bytes")
    op.drop_column("report_templates", "name")
