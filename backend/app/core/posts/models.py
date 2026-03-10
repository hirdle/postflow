from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PlatformName = Literal["telegram", "vk"]
PublishStatus = Literal["draft", "scheduled", "published", "failed", "cancelled"]
ValidationLevel = Literal["error", "warning", "info"]

OPTION_COUNT_ERROR = "Poll must contain between 2 and 10 options."


def _normalize_optional_text(value: object) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None

    return str(value).strip() or None


class PollData(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    question: str
    options: list[str]

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Poll question must not be empty.")
        return normalized

    @field_validator("options", mode="before")
    @classmethod
    def validate_options(cls, value: object) -> list[str]:
        if not isinstance(value, list):
            raise ValueError("Poll options must be provided as a list.")

        normalized = [str(option).strip() for option in value if str(option).strip()]
        if not 2 <= len(normalized) <= 10:
            raise ValueError(OPTION_COUNT_ERROR)

        return normalized


class PostDraftData(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    date: str | None = None
    time: str | None = None
    platform: PlatformName | None = None
    post_type: str | None = Field(default=None, alias="type")
    rubric: str | None = None
    hook_type: str | None = None
    title: str | None = None
    body: str | None = None
    username: str | None = None
    hashtags: list[str] = Field(default_factory=list)
    poll: PollData | None = None
    image_prompt: str | None = None
    has_image: bool = False

    @field_validator(
        "date",
        "time",
        "post_type",
        "rubric",
        "hook_type",
        "title",
        "body",
        "image_prompt",
        mode="before",
    )
    @classmethod
    def normalize_optional_fields(cls, value: object) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: object) -> str | None:
        normalized = _normalize_optional_text(value)
        if normalized is None:
            return None

        return normalized if normalized.startswith("@") else f"@{normalized}"

    @field_validator("hashtags", mode="before")
    @classmethod
    def normalize_hashtags(cls, value: object) -> list[str]:
        if value in (None, ""):
            return []

        if isinstance(value, str):
            raw_tags = re.findall(r"#?([^\s#,]+)", value)
        elif isinstance(value, list):
            raw_tags = []
            for item in value:
                raw_tags.extend(re.findall(r"#?([^\s#,]+)", str(item)))
        else:
            raise ValueError("Hashtags must be a string or a list of strings.")

        normalized: list[str] = []
        seen: set[str] = set()
        for tag in raw_tags:
            cleaned = tag.strip().lstrip("#")
            if cleaned and cleaned not in seen:
                normalized.append(cleaned)
                seen.add(cleaned)

        return normalized


class PostModel(PostDraftData):
    file_name: str

    @field_validator("file_name")
    @classmethod
    def validate_file_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("file_name must not be empty.")
        if not normalized.endswith(".md"):
            raise ValueError("file_name must end with .md.")
        return normalized
