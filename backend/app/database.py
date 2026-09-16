import logging
from collections.abc import AsyncGenerator
from uuid import uuid4

from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

logger = logging.getLogger(__name__)


settings = get_settings()

# Neon / PgBouncer (transaction pooler) + asyncpg: disable statement caching
# and use unique prepared-statement names so ORM queries don't 503.
engine = create_async_engine(
    settings.async_database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    poolclass=NullPool,
    connect_args={
        "ssl": True,
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4().hex}__",
    },
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    On a flaky client connection (weak mobile signal), the request can outlive
    the underlying asyncpg connection — it dies between the endpoint finishing
    and this commit running, which raises even though the endpoint's own logic
    completed. When that happens the write was never durably saved, so the
    client correctly sees a failure and retries; the only bug worth fixing
    here is that trying to rollback an already-dead connection used to throw
    a second, uncaught error that buried the real one in the logs.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            try:
                await session.rollback()
            except DBAPIError:
                logger.warning("Rollback skipped — connection already closed (client likely disconnected)")
            raise
