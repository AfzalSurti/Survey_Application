from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin_requests,
    auth,
    exports,
    projects,
    records,
    reports,
    schemas_api,
    sync,
    templates,
    users,
)
from app.api import settings as settings_api
from app.config import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(
        title=cfg.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origin_list,
        # Preview + production Vercel hosts (env list alone often drifts).
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(schemas_api.router)
    app.include_router(projects.router)
    app.include_router(records.router)
    app.include_router(sync.router)
    app.include_router(reports.router)
    app.include_router(templates.router)
    app.include_router(exports.router)
    app.include_router(settings_api.router)
    app.include_router(admin_requests.router)

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "app": cfg.app_name}

    return app


app = create_app()
