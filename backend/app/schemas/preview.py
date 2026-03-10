from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.posts.models import (
    PlatformName,
    PollData,
    PostDraftData,
    PostModel,
)
from app.core.posts.validation import ValidationIssue

class PreviewRequest(PostDraftData):
    file_name: str | None = None


class PreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    rendered_text: str
    poll: PollData | None = None
    validation_issues: list[ValidationIssue] = Field(
        default_factory=list,
        serialization_alias="validation",
    )
    char_count: int
    platform: PlatformName | None = None
    normalized_post: PostModel
