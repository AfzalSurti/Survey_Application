from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.models import AppSetting, User, UserRole
from app.schemas.survey import SettingOut


router = APIRouter(prefix="/api/settings", tags=["settings"])
DEFAULT_SETTINGS = {
    "min_photo_count": {"value": 4},
    "sync_interval_minutes": {"value": 15},
    "google_sheets": {},
    "google_drive": {},
}


@router.get("", response_model=list[SettingOut])
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> list[AppSetting]:
    result = await db.execute(select(AppSetting).order_by(AppSetting.key))
    existing = {setting.key: setting for setting in result.scalars().all()}
    for key, value_json in DEFAULT_SETTINGS.items():
        if key not in existing:
            setting = AppSetting(key=key, value_json=value_json)
            db.add(setting)
            existing[key] = setting
    await db.flush()
    for setting in existing.values():
        await db.refresh(setting)
    return [existing[key] for key in sorted(existing)]


@router.patch("", response_model=list[SettingOut])
async def update_settings(
    body: dict[str, dict],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.super_admin)),
) -> list[AppSetting]:
    updated: list[AppSetting] = []
    for key, value_json in body.items():
        setting = await db.scalar(select(AppSetting).where(AppSetting.key == key))
        if setting is None:
            setting = AppSetting(key=key, value_json=value_json)
            db.add(setting)
        else:
            setting.value_json = value_json
        updated.append(setting)
    await db.flush()
    for setting in updated:
        await db.refresh(setting)
    return updated
