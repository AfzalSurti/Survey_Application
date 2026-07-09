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
        logger.warning("Google Sheets credentials are configured but unreadable")
        return None


async def append_or_update_record(
    *,
    chainage: str,
    values: list[Any],
    settings: dict[str, Any] | None = None,
) -> str:
    """Append a row, or replace the row whose first value matches chainage."""
    settings = settings or {}
    credentials = _credentials_info(settings)
    spreadsheet_id = settings.get("spreadsheet_id") or os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")
    sheet_name = settings.get("sheet_name", "Survey Records")
    if not credentials or not spreadsheet_id:
        row_id = f"stub-sheet-{uuid.uuid4()}"
        logger.info("Google Sheets unavailable; using stub row id %s", row_id)
        return row_id

    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        scopes = ["https://www.googleapis.com/auth/spreadsheets"]
        service = build(
            "sheets",
            "v4",
            credentials=Credentials.from_service_account_info(credentials, scopes=scopes),
            cache_discovery=False,
        )
        current = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=f"'{sheet_name}'!A:A")
            .execute()
            .get("values", [])
        )
        for index, row in enumerate(current, start=1):
            if row and row[0] == chainage:
                range_name = f"'{sheet_name}'!A{index}"
                service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueInputOption="USER_ENTERED",
                    body={"values": [values]},
                ).execute()
                return range_name
        response = service.spreadsheets().values().append(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A:Z",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [values]},
        ).execute()
        return response.get("updates", {}).get("updatedRange", f"'{sheet_name}'!A")
    except Exception:
        logger.exception("Google Sheets sync failed")
        return f"stub-sheet-{uuid.uuid4()}"
