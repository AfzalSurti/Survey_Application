"""Cloudinary image storage.

Field photos land on Render's ephemeral disk and are wiped on every deploy, so
we push each one to Cloudinary and keep the returned CDN URL. Best-effort: if
Cloudinary is not configured or the upload fails, callers fall back to the local
file / Google Drive path and sync still succeeds.

Configure with either:
  CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
or the three separate vars:
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
"""

import asyncio
import logging
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

_configured: bool | None = None


def _ensure_configured() -> bool:
    global _configured
    if _configured is not None:
        return _configured

    cfg = get_settings()
    # Env values often arrive with a stray newline/space from a copy-paste — that
    # corrupts the request signature ("Invalid Signature") without any other hint.
    url = (cfg.cloudinary_url or "").strip()
    name = (cfg.cloudinary_cloud_name or "").strip()
    key = (cfg.cloudinary_api_key or "").strip()
    secret = (cfg.cloudinary_api_secret or "").strip()
    try:
        import cloudinary

        # Prefer the three explicit vars — more reliable than parsing a URL that
        # may contain characters needing escaping.
        if name and key and secret:
            cloudinary.config(cloud_name=name, api_key=key, api_secret=secret, secure=True)
        elif url:
            cloudinary.config(cloudinary_url=url, secure=True)
        else:
            _configured = False
            return False

        current = cloudinary.config()
        _configured = bool(current.cloud_name and current.api_key and current.api_secret)
    except Exception:
        logger.exception("Cloudinary configuration failed")
        _configured = False
    return _configured


def _upload_sync(local_path: Path, *, folder: str, public_id: str | None) -> tuple[str | None, str | None]:
    import cloudinary.uploader

    result = cloudinary.uploader.upload(
        str(local_path),
        folder=folder,
        public_id=public_id,
        resource_type="image",
        overwrite=True,
        unique_filename=public_id is None,
        use_filename=public_id is None,
    )
    return result.get("public_id"), result.get("secure_url")


async def upload_image(
    local_path: Path,
    *,
    folder: str = "gdrpl-survey",
    public_id: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (public_id, secure_url), or (None, None) if unavailable."""
    if not _ensure_configured():
        return None, None
    try:
        return await asyncio.to_thread(_upload_sync, local_path, folder=folder, public_id=public_id)
    except Exception:
        logger.exception("Cloudinary upload failed for %s", local_path.name)
        return None, None
