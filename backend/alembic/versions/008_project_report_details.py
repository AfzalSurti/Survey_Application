"""008 project report details (cover page + introduction of the inventory report)

Revision ID: 008_project_report_details
Revises: 007_record_client_category
Create Date: 2026-09-26
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008_project_report_details"
down_revision: Union[str, None] = "007_record_client_category"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("client_name", "VARCHAR(255)"),
    ("piu_name", "VARCHAR(255)"),
    ("consultant_name", "VARCHAR(255)"),
    ("association_name", "VARCHAR(255)"),
    ("work_name", "TEXT"),
    ("background_text", "TEXT"),
)


def upgrade() -> None:
    for name, sql_type in _COLUMNS:
        op.execute(f"ALTER TABLE projects ADD COLUMN IF NOT EXISTS {name} {sql_type}")


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.execute(f"ALTER TABLE projects DROP COLUMN IF EXISTS {name}")
