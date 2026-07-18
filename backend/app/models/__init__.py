import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    surveyor = "surveyor"
    admin = "admin"
    super_admin = "super_admin"


class SurveyModule(str, enum.Enum):
    structure_inventory = "structure_inventory"
    utility_shifting = "utility_shifting"


class SurveyStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class SyncStatus(str, enum.Enum):
    pending = "pending"
    synced = "synced"
    error = "error"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=lambda enum: [e.value for e in enum]),
        nullable=False,
    )
    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    projects_created = relationship(
        "Project",
        back_populates="creator",
        foreign_keys="Project.created_by",
    )
    projects_as_key_engineer = relationship(
        "Project",
        back_populates="key_engineer",
        foreign_keys="Project.key_engineer_id",
    )
    pre_survey_entries = relationship("PreSurveyEntry", back_populates="surveyor")
    survey_records = relationship("SurveyRecord", back_populates="surveyor")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    project_number: Mapped[str] = mapped_column(String(100), nullable=False)
    highway_number: Mapped[str] = mapped_column(String(100), nullable=False)
    key_engineer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    key_engineer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User", back_populates="projects_created", foreign_keys=[created_by])
    key_engineer = relationship("User", back_populates="projects_as_key_engineer", foreign_keys=[key_engineer_id])
    pre_survey_entries = relationship("PreSurveyEntry", back_populates="project")
    survey_records = relationship("SurveyRecord", back_populates="project")
    assignments = relationship("ProjectAssignment", back_populates="project", cascade="all, delete-orphan")


class ProjectAssignment(Base):
    """Maps surveyors to projects created/managed by super admin."""

    __tablename__ = "project_assignments"
    __table_args__ = (
        UniqueConstraint("project_id", "surveyor_id", name="uq_project_surveyor"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    surveyor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="assignments")
    surveyor = relationship("User", foreign_keys=[surveyor_id])


class PreSurveyEntry(Base):
    __tablename__ = "pre_survey_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    surveyor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    head_surveyor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="pre_survey_entries")
    surveyor = relationship("User", back_populates="pre_survey_entries")


class QuestionnaireSchema(Base):
    __tablename__ = "questionnaire_schemas"
    __table_args__ = (
        UniqueConstraint("module", "version", name="uq_questionnaire_module_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module: Mapped[SurveyModule] = mapped_column(
        Enum(SurveyModule, name="survey_module", values_callable=lambda enum: [e.value for e in enum]),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SurveyRecord(Base):
    __tablename__ = "survey_records"
    __table_args__ = (
        UniqueConstraint("project_id", "chainage", name="uq_survey_project_chainage"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    surveyor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    structure_category: Mapped[str] = mapped_column(Text, nullable=False)
    chainage: Mapped[str] = mapped_column(Text, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    responses_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[SurveyStatus] = mapped_column(
        Enum(
            SurveyStatus,
            name="survey_status",
            values_callable=lambda enum: [e.value for e in enum],
        ),
        default=SurveyStatus.draft,
        nullable=False,
    )
    sync_status: Mapped[SyncStatus] = mapped_column(
        Enum(
            SyncStatus,
            name="sync_status",
            values_callable=lambda enum: [e.value for e in enum],
        ),
        default=SyncStatus.pending,
        nullable=False,
    )
    sheets_row_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    project = relationship("Project", back_populates="survey_records")
    surveyor = relationship("User", back_populates="survey_records")
    photos = relationship("SurveyPhoto", back_populates="survey_record", cascade="all, delete-orphan")


class SurveyPhoto(Base):
    __tablename__ = "survey_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("survey_records.id", ondelete="CASCADE"), nullable=False
    )
    file_name: Mapped[str] = mapped_column(String(512), nullable=False)
    local_path: Mapped[str] = mapped_column(Text, nullable=False)
    drive_file_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    drive_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_status: Mapped[SyncStatus] = mapped_column(
        Enum(
            SyncStatus,
            name="sync_status",
            create_type=False,
            values_callable=lambda enum: [e.value for e in enum],
        ),
        default=SyncStatus.pending,
        nullable=False,
    )
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    survey_record = relationship("SurveyRecord", back_populates="photos")


class ReportTemplate(Base):
    __tablename__ = "report_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Untitled template")
    module: Mapped[SurveyModule] = mapped_column(
        Enum(
            SurveyModule,
            name="survey_module",
            create_type=False,
            values_callable=lambda enum: [e.value for e in enum],
        ),
        nullable=False,
    )
    template_docx_path: Mapped[str] = mapped_column(Text, nullable=False)
    docx_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AppSetting(Base):
    """Key-value app settings (min photo count, sync intervals, Google config refs)."""

    __tablename__ = "app_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class AdminRequest(Base):
    """Admin suggestions / requests for super admin (questions, flow, report format)."""

    __tablename__ = "admin_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
