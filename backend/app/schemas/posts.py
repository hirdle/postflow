from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.posts.models import PlatformName, PostDraftData, PostModel, PublishStatus
from app.schemas.publishing import PublishAttempt, PublishRecord


class PostListItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    file_name: str
    date: str | None = None
    time: str | None = None
    platform: PlatformName | None = None
    post_type: str | None = None
    rubric: str | None = None
    title: str | None = None
    status: PublishStatus = "draft"
    has_image: bool = False
    has_poll: bool = False


class PostDetail(PostModel):
    status: PublishStatus = "draft"
    raw_markdown: str
    publish_records: list[PublishRecord] = Field(default_factory=list)
    publish_attempts: list[PublishAttempt] = Field(default_factory=list)


class PostCreate(PostDraftData):
    date: str
    platform: PlatformName


class PostUpdate(PostDraftData):
    pass
