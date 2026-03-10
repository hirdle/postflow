from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.core.posts.models import PlatformName, PublishStatus


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schedule: bool = False
    platform: PlatformName | None = None
    date: str | None = None
    time: str | None = None


class PublishRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: int | None = None
    file_name: str
    platform: PlatformName
    scheduled_date: str | None = None
    scheduled_time: str | None = None
    message_id: int | None = None
    poll_message_id: int | None = None
    status: PublishStatus
    published_at: str | None = None
    error: str | None = None
    created_at: str | None = None


class PublishAttempt(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: int | None = None
    file_name: str
    attempt_type: str
    payload_snapshot: str | None = None
    result: str | None = None
    created_at: str | None = None


class ScheduledPost(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: int
    file_name: str
    platform: PlatformName
    scheduled_date: str
    scheduled_time: str
    status: PublishStatus = "scheduled"


class ScheduleUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    scheduled_date: str
    scheduled_time: str
