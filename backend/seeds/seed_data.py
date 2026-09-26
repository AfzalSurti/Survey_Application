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
try:
    from seeds.questionnaire_v2 import STRUCTURE_INVENTORY_SCHEMA_V2, validate_v2
    from seeds.questionnaire_v3 import STRUCTURE_INVENTORY_SCHEMA_V3, validate_v3
except Exception as exc:  # noqa: BLE001 — a broken newer schema must never stop the API from starting
    STRUCTURE_INVENTORY_SCHEMA_V2 = STRUCTURE_INVENTORY_SCHEMA_V3 = None  # type: ignore[assignment]
    validate_v2 = validate_v3 = None  # type: ignore[assignment]
    print(f"WARNING: newer questionnaire versions could not be loaded ({type(exc).__name__}: {exc}); skipping")


async def _roll_out(module: str, schema: dict | None, validate) -> None:
    """Add `schema` as the new active version once, without ever overriding an admin.

    Own session, every error swallowed: this runs from the start-up path, so an
    exception must never stop the API booting. Only acts while the stored
    newest version is *older* than this one — a version a super admin published
    (or that was already rolled out) is left exactly as is, never re-activated.
    """
    if schema is None or validate is None:
        return
    version = schema["version"]
    try:
        problems = validate()
        if problems:
            print(f"Questionnaire v{version} NOT applied — failed validation: {problems}")
            return
        async with AsyncSessionLocal() as db:
            newest = await db.scalar(
                select(func.max(QuestionnaireSchema.version)).where(QuestionnaireSchema.module == module)
            )
            if newest is None:
                print(f"Questionnaire v{version} skipped — nothing seeded yet for {module}")
                return
            if newest >= version:
                print(f"Questionnaire v{version} already present (newest is v{newest}) — skipped")
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
                    id=uuid.uuid4(), module=module, version=version, schema_json=schema, is_active=True
                )
            )
            await db.commit()
            print(f"Seeded {module} v{version} as active ({count_questions(schema)} category questions)")
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: questionnaire v{version} not applied ({type(exc).__name__}: {exc}); continuing")


async def apply_structure_inventory_upgrades() -> None:
    await _roll_out("structure_inventory", STRUCTURE_INVENTORY_SCHEMA_V2, validate_v2)
    await _roll_out("structure_inventory", STRUCTURE_INVENTORY_SCHEMA_V3, validate_v3)


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

    await apply_structure_inventory_upgrades()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
