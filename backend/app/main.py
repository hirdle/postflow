from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_routers
from app.config import ensure_runtime_directories, get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_runtime_directories()
    from app.infra.database import initialize_database

    await initialize_database()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.project_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get(f"{settings.api_prefix}/health", tags=["health"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    for router in api_routers:
        app.include_router(router, prefix=settings.api_prefix)

    return app


app = create_app()
