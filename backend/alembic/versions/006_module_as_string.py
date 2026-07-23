"""006 module as string for custom surveys

Revision ID: 006_module_string
Revises: 005_admin_requests
Create Date: 2026-07-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_module_string"
down_revision: Union[str, None] = "005_admin_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Allow custom survey modules beyond the original two enum values.
    op.execute(
        "ALTER TABLE questionnaire_schemas "
        "ALTER COLUMN module TYPE VARCHAR(100) USING module::text"
    )
    op.execute(
        "ALTER TABLE report_templates "
        "ALTER COLUMN module TYPE VARCHAR(100) USING module::text"
    )


def downgrade() -> None:
    # Downgrade may fail if custom module values exist.
    op.execute(
        "ALTER TABLE questionnaire_schemas "
        "ALTER COLUMN module TYPE survey_module USING module::survey_module"
    )
    op.execute(
        "ALTER TABLE report_templates "
        "ALTER COLUMN module TYPE survey_module USING module::survey_module"
    )
