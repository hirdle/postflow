from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


VkConnectionStatus = Literal[
    "not_connected",
    "connected",
    "expired",
]


class SettingsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    telegram_api_id: str | None = None
    telegram_api_hash: str | None = None
    telegram_session_path: str | None = None
    telegram_channel: str | None = None
    vk_client_id: str | None = None
    vk_client_secret: str | None = None
    vk_access_token: str | None = None
    vk_refresh_token: str | None = None
    vk_group_id: str | None = None
    vk_group_name: str | None = None
    vk_account_label: str | None = None
    vk_auth_status: VkConnectionStatus = "not_connected"
    vk_token_expires_at: datetime | None = None
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


VkAuthSessionStatus = Literal[
    "waiting_for_callback",
    "authorizing",
    "authorized",
    "expired",
    "failed",
    "cancelled",
]


class VkCommunityOption(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)

    group_id: str
    name: str
    screen_name: str | None = None
    role: Literal["admin", "editor"]
    can_post: bool


class VkAuthSessionStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    redirect_uri: str


class VkAuthSessionExchangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    payload: str | None = None
    access_token: str | None = None
    expires_in: str | None = None
    code: str | None = None
    state: str | None = None
    user_id: str | None = None
    scope: str | None = None
    error: str | None = None
    error_description: str | None = None


class VkAuthSessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    session_id: str
    status: VkAuthSessionStatus
    started_at: datetime
    expires_at: datetime | None = None
    authorize_url: str | None = None
    error: str | None = None
    account_label: str | None = None
    communities: list[VkCommunityOption] = []


class VkCommunitiesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    communities: list[VkCommunityOption]


class VkTokenConnectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    value: str


class VkTokenConnectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    settings: SettingsResponse
    communities: list[VkCommunityOption]
