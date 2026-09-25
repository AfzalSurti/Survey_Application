"""Seed initial super_admin user, default settings, and questionnaire schemas."""

from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.models import AppSetting, QuestionnaireSchema, SurveyModule, User, UserRole
from seeds.questionnaire_v1 import (
    STRUCTURE_INVENTORY_SCHEMA,
    UTILITY_SHIFTING_SCHEMA,
    count_questions,
)
from seeds.questionnaire_v2 import STRUCTURE_INVENTORY_SCHEMA_V2, validate_v2


async def apply_structure_inventory_v2() -> None:
    """Roll out questionnaire v2 once, without ever overriding an admin.

    Runs in its own session and swallows every error: this file runs in the
    Render start command (`... && python seeds/seed_data.py && uvicorn ...`), so
    an exception here would stop the API from booting.

    - Only acts while v1 is the newest version. If v2 (or anything newer) is
      already stored — e.g. a super admin published from the schema editor —
      it is left exactly as is, and is never re-activated behind their back.
    """
    module = "structure_inventory"
    try:
        problems = validate_v2()
        if problems:
            print(f"Questionnaire v2 NOT applied — failed validation: {problems}")
            return
        async with AsyncSessionLocal() as db:
            newest = await db.scalar(
                select(func.max(QuestionnaireSchema.version)).where(QuestionnaireSchema.module == module)
            )
            if newest is None:
                print("Questionnaire v2 skipped — no v1 seeded yet")
                return
            if newest >= STRUCTURE_INVENTORY_SCHEMA_V2["version"]:
                print(f"Questionnaire v2 already present (newest is v{newest}) — skipped")
                return
            currently_active = await db.execute(
                select(QuestionnaireSchema).where(
                    QuestionnaireSchema.module == module,
                    QuestionnaireSchema.is_active.is_(True),
                )
            )
            for row in currently_active.scalars():
                row.is_active = False
            db.add(
                QuestionnaireSchema(
                    id=uuid.uuid4(),
                    module=module,
                    version=STRUCTURE_INVENTORY_SCHEMA_V2["version"],
                    schema_json=STRUCTURE_INVENTORY_SCHEMA_V2,
                    is_active=True,
                )
            )
            await db.commit()
            print(
                f"Seeded {module} v{STRUCTURE_INVENTORY_SCHEMA_V2['version']} as active "
                f"({count_questions(STRUCTURE_INVENTORY_SCHEMA_V2)} category questions)"
            )
    except Exception as exc:  # noqa: BLE001 — must never block API startup
        print(f"WARNING: questionnaire v2 not applied ({type(exc).__name__}: {exc}); continuing on existing schema")


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "admin@gdrpl.com"))
        admin = result.scalar_one_or_none()
        if admin is None:
            admin = User(
                id=uuid.uuid4(),
                name="GDRPL Super Admin",
                email="admin@gdrpl.com",
                password_hash=hash_password("ChangeMe123!"),
                role=UserRole.super_admin,
                organization="Geo Design and Research Pvt. Ltd.",
                is_active=True,
            )
            db.add(admin)
            print("Created super_admin: admin@gdrpl.com / ChangeMe123!")
        else:
            print("Super admin already exists — skipped")

        result = await db.execute(select(User).where(User.email == "surveyor@gdrpl.com"))
        surveyor = result.scalar_one_or_none()
        if surveyor is None:
            surveyor = User(
                id=uuid.uuid4(),
                name="Field Surveyor",
                email="surveyor@gdrpl.com",
                password_hash=hash_password("Surveyor123!"),
                role=UserRole.surveyor,
                organization="Geo Design and Research Pvt. Ltd.",
                is_active=True,
            )
            db.add(surveyor)
            print("Created surveyor: surveyor@gdrpl.com / Surveyor123!")

        result = await db.execute(select(User).where(User.email == "admin.ops@gdrpl.com"))
        ops_admin = result.scalar_one_or_none()
        if ops_admin is None:
            ops_admin = User(
                id=uuid.uuid4(),
                name="GDRPL Admin",
                email="admin.ops@gdrpl.com",
                password_hash=hash_password("Admin123!"),
                role=UserRole.admin,
                organization="Geo Design and Research Pvt. Ltd.",
                is_active=True,
            )
            db.add(ops_admin)
            print("Created admin: admin.ops@gdrpl.com / Admin123!")

        await db.flush()

        for module, schema in (
            (SurveyModule.structure_inventory, STRUCTURE_INVENTORY_SCHEMA),
            (SurveyModule.utility_shifting, UTILITY_SHIFTING_SCHEMA),
        ):
            result = await db.execute(
                select(QuestionnaireSchema).where(
                    QuestionnaireSchema.module == (module.value if hasattr(module, "value") else str(module)),
                    QuestionnaireSchema.version == schema["version"],
                )
            )
            if result.scalar_one_or_none() is None:
                db.add(
                    QuestionnaireSchema(
                        id=uuid.uuid4(),
                        module=module.value if hasattr(module, "value") else str(module),
                        version=schema["version"],
                        schema_json=schema,
                        is_active=True,
                        created_by=admin.id if admin else None,
                    )
                )
                print(
                    f"Seeded {getattr(module, 'value', module)} v{schema['version']} "
                    f"({count_questions(schema)} category questions)"
                )
            else:
                print(f"{module.value} v{schema['version']} already seeded — skipped")

        defaults = {
            "min_photo_count": {"value": 4},
            "sync_interval_minutes": {"value": 15},
            "google_sheets": {"spreadsheet_id": None, "enabled": False},
            "google_drive": {"folder_id": None, "enabled": False},
        }
        for key, value in defaults.items():
            result = await db.execute(select(AppSetting).where(AppSetting.key == key))
            if result.scalar_one_or_none() is None:
                db.add(AppSetting(id=uuid.uuid4(), key=key, value_json=value))
                print(f"Setting seeded: {key}")

        await db.commit()

    await apply_structure_inventory_v2()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
