from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Query params Neon may include that asyncpg does not accept
_ASYNCPG_DROP_PARAMS = {"sslmode", "ssl", "channel_binding"}


def _clean_url(raw: str) -> str:
    return raw.strip().strip('"').strip("'")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "GDRPL Survey"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = True

    # Render / Neon: set env var DATABASE_URL (exact name, no spaces)
    database_url: str = Field(
        validation_alias=AliasChoices("DATABASE_URL", "database_url", "NEON_DATABASE_URL"),
        description="Postgres connection string (Neon)",
    )

    jwt_secret_key: str = Field(
        default="change-me-in-production-use-openssl-rand-hex-32",
        validation_alias=AliasChoices("JWT_SECRET_KEY", "jwt_secret_key"),
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:8081",
        validation_alias=AliasChoices("CORS_ORIGINS", "cors_origins"),
    )

    min_photo_count: int = 4

    @property
    def async_database_url(self) -> str:
        """SQLAlchemy async URL; SSL is passed via connect_args (see database.py)."""
        url = _clean_url(self.database_url)
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        parsed = urlparse(url)
        query = [
            (k, v)
            for k, v in parse_qsl(parsed.query, keep_blank_values=True)
            if k.lower() not in _ASYNCPG_DROP_PARAMS
        ]
        return urlunparse(parsed._replace(query=urlencode(query)))

    @property
    def sync_database_url(self) -> str:
        """Sync URL for Alembic / psycopg2."""
        url = _clean_url(self.database_url)
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()
    except Exception as exc:
        raise RuntimeError(
            "Missing required env var DATABASE_URL. "
            "On Render: Environment → Add DATABASE_URL = your Neon postgres connection string."
        ) from exc
