from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class MediaGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    file_name: str
    prompt: str
    model: str | None = None
    size: str = "1024x1024"


class MediaGenerateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    file_name: str
    image_path: str
    model: str | None = None


class MediaUploadResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    file_name: str
    image_path: str


class MediaModelInfo(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str
    owned_by: str | None = None
