"""API router registry for the PostFlow backend."""

from app.api.media import router as media_router
from app.api.posts import router as posts_router
from app.api.preview import router as preview_router
from app.api.publish import router as publish_router
from app.api.schedules import router as schedules_router
from app.api.settings import router as settings_router

api_routers = (
    posts_router,
    preview_router,
    publish_router,
    media_router,
    schedules_router,
    settings_router,
)
