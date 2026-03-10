from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SettingsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    telegram_api_id: str | None = None
    telegram_api_hash: str | None = None
    telegram_session_path: str | None = None
    telegram_channel: str | None = None
    vk_access_token: str | None = None
    vk_group_id: str | None = None
    image_api_key: str | None = None
    image_base_url: str | None = None
    image_default_model: str | None = None


class SettingsUpdate(SettingsResponse):
    pass
