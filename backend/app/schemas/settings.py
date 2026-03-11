from __future__ import annotations

from datetime import datetime
from typing import Literal

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


TelegramSessionStatus = Literal[
    "waiting_for_scan",
    "password_required",
    "authorized",
    "expired",
    "failed",
    "cancelled",
]


class TelegramSessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    session_id: str
    status: TelegramSessionStatus
    started_at: datetime
    expires_at: datetime | None = None
    qr_url: str | None = None
    qr_image_data_url: str | None = None
    error: str | None = None
    account_label: str | None = None


class TelegramSessionPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    password: str
