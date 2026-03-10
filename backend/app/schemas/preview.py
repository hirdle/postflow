from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.posts.models import (
    PlatformName,
    PollData,
    PostDraftData,
    PostModel,
    ValidationLevel,
)


class ValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    level: ValidationLevel
    code: str
    message: str


class PreviewRequest(PostDraftData):
    file_name: str | None = None


class PreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rendered_text: str
    poll: PollData | None = None
    validation_issues: list[ValidationIssue] = Field(default_factory=list)
    char_count: int
    platform: PlatformName | None = None
    normalized_post: PostModel
