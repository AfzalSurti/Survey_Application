import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)


def _credentials_info(settings: dict[str, Any] | None = None) -> dict[str, Any] | None:
    configured = (settings or {}).get("service_account_json") or os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not configured:
        return None
    try:
        path = Path(configured)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else json.loads(configured)
    except (OSError, json.JSONDecodeError):
        logger.warning("Google Drive credentials are configured but unreadable")
        return None


async def upload_photo(
    local_path: Path,
    *,
    settings: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Upload a local photo to Drive, falling back to a deterministic stub response."""
    settings = settings or {}
    credentials = _credentials_info(settings)
    folder_id = settings.get("folder_id") or os.getenv("GOOGLE_DRIVE_FOLDER_ID")
    if not credentials:
        file_id = f"stub-drive-{uuid.uuid4()}"
        logger.info("Google Drive unavailable; using stub file id %s", file_id)
        return file_id, f"https://drive.google.com/file/d/{file_id}/view"

    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        scopes = ["https://www.googleapis.com/auth/drive.file"]
        service = build(
            "drive",
            "v3",
            credentials=Credentials.from_service_account_info(credentials, scopes=scopes),
            cache_discovery=False,
        )
        metadata: dict[str, Any] = {"name": local_path.name}
        if folder_id:
            metadata["parents"] = [folder_id]
        response = service.files().create(
            body=metadata,
            media_body=MediaFileUpload(str(local_path), resumable=True),
            fields="id,webViewLink",
        ).execute()
        file_id = response["id"]
        return file_id, response.get("webViewLink", f"https://drive.google.com/file/d/{file_id}/view")
    except Exception:
        logger.exception("Google Drive upload failed")
        file_id = f"stub-drive-{uuid.uuid4()}"
        return file_id, f"https://drive.google.com/file/d/{file_id}/view"
