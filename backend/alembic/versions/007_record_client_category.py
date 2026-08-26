"""007 survey record uniqueness by category + client_id

Revision ID: 007_record_client_category
Revises: 006_module_string
Create Date: 2026-08-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_record_client_category"
down_revision: Union[str, None] = "006_module_string"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE survey_records DROP CONSTRAINT IF EXISTS uq_survey_project_chainage")
    op.execute(
        "ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS client_id VARCHAR(255)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_records_client_id "
        "ON survey_records (client_id) WHERE client_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_project_chainage_category "
        "ON survey_records (project_id, chainage, structure_category)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_survey_project_chainage_category")
    op.execute("DROP INDEX IF EXISTS uq_survey_records_client_id")
    op.execute("ALTER TABLE survey_records DROP COLUMN IF EXISTS client_id")
    op.create_unique_constraint(
        "uq_survey_project_chainage",
        "survey_records",
        ["project_id", "chainage"],
    )
