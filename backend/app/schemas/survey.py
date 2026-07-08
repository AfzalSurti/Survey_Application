from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import SurveyModule, SurveyStatus, SyncStatus


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    project_number: str = Field(min_length=1, max_length=100)
    highway_number: str = Field(min_length=1, max_length=100)


class ProjectOut(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_by: UUID
    created_at: datetime


class PreSurveyEntryCreate(BaseModel):
    project_id: UUID
    head_surveyor_name: str = Field(min_length=1, max_length=255)
    organization: str = Field(min_length=1, max_length=255)


class PreSurveyEntryOut(PreSurveyEntryCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    surveyor_id: UUID
    created_at: datetime


class SurveyRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    surveyor_id: UUID
    structure_category: str
    chainage: str
    schema_version: int
    responses_json: dict[str, Any]
    latitude: Decimal | None
    longitude: Decimal | None
    captured_at: datetime | None
    status: SurveyStatus
    sync_status: SyncStatus
    sheets_row_id: str | None
    created_at: datetime
    updated_at: datetime


class SurveyRecordPage(BaseModel):
    items: list[SurveyRecordOut]
    total: int
    page: int
    page_size: int


class SurveyRecordStatusUpdate(BaseModel):
    status: SurveyStatus


class SyncSurveyRecordRequest(BaseModel):
    client_id: str | None = Field(default=None, max_length=255)
    project_id: UUID | None = None
    project_name: str | None = Field(default=None, min_length=1, max_length=255)
    project_number: str | None = Field(default=None, min_length=1, max_length=100)
    highway_number: str | None = Field(default=None, min_length=1, max_length=100)
    chainage: str = Field(min_length=1)
    responses_json: dict[str, Any] = Field(default_factory=dict)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    captured_at: datetime | None = None
    structure_category: str = Field(min_length=1)
    schema_version: int = Field(ge=1)


class SyncSurveyRecordResponse(BaseModel):
    id: UUID
    sheets_row_id: str | None
    created: bool


class SurveyPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    survey_record_id: UUID
    file_name: str
    local_path: str
    drive_file_id: str | None
    drive_url: str | None
    sync_status: SyncStatus
    taken_at: datetime | None
    created_at: datetime


class GenerateReportRequest(BaseModel):
    record_ids: list[UUID] = Field(min_length=1)


class SettingUpdate(BaseModel):
    value_json: dict[str, Any]


class SettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value_json: dict[str, Any]
    updated_at: datetime


class QuestionnaireSchemaCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    module: SurveyModule
    version: int = Field(ge=1)
    schema_json: dict[str, Any]
    is_active: bool = True


class QuestionnaireSchemaActivation(BaseModel):
    is_active: bool
