from __future__ import annotations

import contextlib
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.infra.database import get_db
from app.infra.telegram_qr_auth import get_telegram_qr_auth_manager
from app.infra.vk_auth import get_vk_auth_manager
from app.infra.vk_client import VKClient
from app.schemas.settings import (
    SettingsResponse,
    SettingsUpdate,
    TelegramSessionPasswordRequest,
    TelegramSessionResponse,
    VkAuthSessionExchangeRequest,
    VkAuthSessionResponse,
    VkAuthSessionStartRequest,
    VkCommunitiesResponse,
)

router = APIRouter(prefix="/settings", tags=["settings"])

SETTINGS_KEYS = (
    "telegram_api_id",
    "telegram_api_hash",
    "telegram_session_path",
    "telegram_channel",
    "vk_client_id",
    "vk_access_token",
    "vk_refresh_token",
    "vk_group_id",
    "vk_group_name",
    "vk_account_label",
    "vk_token_expires_at",
    "image_api_key",
    "image_base_url",
    "image_default_model",
)
VK_CONNECTION_CLEAR_KEYS = (
    "vk_access_token",
    "vk_refresh_token",
    "vk_group_id",
    "vk_group_name",
    "vk_user_id",
    "vk_token_expires_at",
    "vk_token_scope",
    "vk_account_label",
    "vk_device_id",
)
SECRET_KEYS = {
    "telegram_api_id",
    "telegram_api_hash",
    "vk_access_token",
    "vk_refresh_token",
    "image_api_key",
}
VK_METADATA_RESET_KEYS = (
    "vk_refresh_token",
    "vk_user_id",
    "vk_token_expires_at",
    "vk_token_scope",
    "vk_account_label",
    "vk_device_id",
    "vk_group_id",
    "vk_group_name",
)


@router.get("", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    return await _build_settings_response()


@router.put("", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdate) -> SettingsResponse:
    incoming = payload.model_dump(exclude_unset=True)
    existing = await _load_settings_map()
    normalized_updates = _normalize_incoming_settings(incoming, existing)
    keys_to_delete: set[str] = set()

    if "vk_access_token" in normalized_updates:
        keys_to_delete.update(VK_METADATA_RESET_KEYS)

    if "vk_group_id" in normalized_updates:
        community = await _resolve_vk_community(
            group_id=normalized_updates["vk_group_id"],
            access_token=normalized_updates.get("vk_access_token"),
            client_id=normalized_updates.get("vk_client_id") or existing.get("vk_client_id"),
            refresh_token=normalized_updates.get("vk_refresh_token"),
            device_id=existing.get("vk_device_id"),
        )
        normalized_updates["vk_group_id"] = community.group_id
        normalized_updates["vk_group_name"] = community.name
        keys_to_delete.discard("vk_group_id")
        keys_to_delete.discard("vk_group_name")
    elif "vk_group_name" in normalized_updates:
        normalized_updates.pop("vk_group_name", None)

    async with get_db() as db:
        if keys_to_delete:
            await db.execute(
                "DELETE FROM app_settings WHERE key IN ({})".format(
                    ", ".join("?" for _ in keys_to_delete)
                ),
                tuple(keys_to_delete),
            )

        for key, value in normalized_updates.items():
            await db.execute(
                """
                INSERT INTO app_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, value),
            )
        await db.commit()

    return await _build_settings_response()


@router.post(
    "/telegram/session",
    response_model=TelegramSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_telegram_session() -> TelegramSessionResponse:
    manager = get_telegram_qr_auth_manager()

    try:
        snapshot = await manager.start()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return TelegramSessionResponse.model_validate(snapshot)


@router.get(
    "/telegram/session/{session_id}",
    response_model=TelegramSessionResponse,
)
async def get_telegram_session(session_id: str) -> TelegramSessionResponse:
    manager = get_telegram_qr_auth_manager()

    try:
        snapshot = await manager.get(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Telegram session not found.") from exc

    return TelegramSessionResponse.model_validate(snapshot)


@router.post(
    "/telegram/session/{session_id}/password",
    response_model=TelegramSessionResponse,
)
async def submit_telegram_session_password(
    session_id: str,
    payload: TelegramSessionPasswordRequest,
) -> TelegramSessionResponse:
    manager = get_telegram_qr_auth_manager()

    try:
        snapshot = await manager.submit_password(session_id, payload.password)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Telegram session not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return TelegramSessionResponse.model_validate(snapshot)


@router.delete(
    "/telegram/session/{session_id}",
    response_model=TelegramSessionResponse,
)
async def cancel_telegram_session(session_id: str) -> TelegramSessionResponse:
    manager = get_telegram_qr_auth_manager()

    try:
        snapshot = await manager.cancel(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Telegram session not found.") from exc

    return TelegramSessionResponse.model_validate(snapshot)


@router.post(
    "/vk/session",
    response_model=VkAuthSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_vk_session(payload: VkAuthSessionStartRequest) -> VkAuthSessionResponse:
    manager = get_vk_auth_manager()

    try:
        snapshot = await manager.start(payload.redirect_uri)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return VkAuthSessionResponse.model_validate(snapshot)


@router.get(
    "/vk/session/{session_id}",
    response_model=VkAuthSessionResponse,
)
async def get_vk_session(session_id: str) -> VkAuthSessionResponse:
    manager = get_vk_auth_manager()

    try:
        snapshot = await manager.get(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VK session not found.") from exc

    return VkAuthSessionResponse.model_validate(snapshot)


@router.post(
    "/vk/session/{session_id}/exchange",
    response_model=VkAuthSessionResponse,
)
async def exchange_vk_session(
    session_id: str,
    payload: VkAuthSessionExchangeRequest,
) -> VkAuthSessionResponse:
    manager = get_vk_auth_manager()

    try:
        snapshot = await manager.exchange(session_id, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VK session not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return VkAuthSessionResponse.model_validate(snapshot)


@router.delete(
    "/vk/session/{session_id}",
    response_model=VkAuthSessionResponse,
)
async def cancel_vk_session(session_id: str) -> VkAuthSessionResponse:
    manager = get_vk_auth_manager()

    try:
        snapshot = await manager.cancel(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VK session not found.") from exc

    return VkAuthSessionResponse.model_validate(snapshot)


@router.get(
    "/vk/communities",
    response_model=VkCommunitiesResponse,
)
async def get_vk_communities() -> VkCommunitiesResponse:
    try:
        client = await VKClient.from_auth_settings()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        communities = await client.list_communities()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    finally:
        await client.close()

    return VkCommunitiesResponse(communities=communities)


@router.delete(
    "/vk/connection",
    response_model=SettingsResponse,
)
async def delete_vk_connection() -> SettingsResponse:
    client = None
    with contextlib.suppress(ValueError):
        client = await VKClient.from_auth_settings()

    if client is not None:
        with contextlib.suppress(Exception):
            await client.logout()
        await client.close()

    async with get_db() as db:
        await db.execute(
            "DELETE FROM app_settings WHERE key IN ({})".format(
                ", ".join("?" for _ in VK_CONNECTION_CLEAR_KEYS)
            ),
            VK_CONNECTION_CLEAR_KEYS,
        )
        await db.commit()

    return await _build_settings_response()


async def _load_settings_map() -> dict[str, str | None]:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN ({})".format(
                ", ".join("?" for _ in SETTINGS_KEYS)
            ),
            SETTINGS_KEYS,
        )
        rows = await cursor.fetchall()

        internal_cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)",
            ("vk_user_id", "vk_token_scope", "vk_device_id"),
        )
        internal_rows = await internal_cursor.fetchall()

    values = {key: None for key in SETTINGS_KEYS}
    values.update({row["key"]: row["value"] for row in rows})
    values.update({row["key"]: row["value"] for row in internal_rows})
    return values


async def _build_settings_response() -> SettingsResponse:
    settings_map = await _load_settings_map()
    masked = _mask_settings(settings_map)
    masked["vk_auth_status"] = _derive_vk_auth_status(settings_map)
    masked["vk_token_expires_at"] = _parse_optional_datetime(settings_map.get("vk_token_expires_at"))
    return SettingsResponse(**masked)


def _normalize_incoming_settings(
    incoming: dict[str, str | None],
    existing: dict[str, str | None],
) -> dict[str, str]:
    normalized_updates: dict[str, str] = {}
    for key, value in incoming.items():
        if key not in SETTINGS_KEYS:
            continue
        normalized = value.strip() if isinstance(value, str) else value
        if normalized in (None, ""):
            continue
        if key in SECRET_KEYS and _is_masked_update(str(normalized), existing.get(key)):
            continue
        normalized_updates[key] = str(normalized)
    return normalized_updates


async def _resolve_vk_community(
    *,
    group_id: str,
    access_token: str | None,
    client_id: str | None,
    refresh_token: str | None,
    device_id: str | None,
):
    if access_token is not None:
        client = VKClient(
            access_token=access_token,
            client_id=client_id,
            refresh_token=refresh_token,
            device_id=device_id,
        )
    else:
        client = await VKClient.from_auth_settings()

    try:
        return await client.validate_community_access(group_id)
    finally:
        await client.close()


def _mask_settings(settings_map: dict[str, str | None]) -> dict[str, str | None]:
    masked: dict[str, str | None] = {}
    for key, value in settings_map.items():
        if key not in SETTINGS_KEYS:
            continue
        if key in SECRET_KEYS:
            masked[key] = _mask_secret(value)
        else:
            masked[key] = value
    return masked


def _derive_vk_auth_status(settings_map: dict[str, str | None]) -> str:
    access_token = (settings_map.get("vk_access_token") or "").strip()
    if not access_token:
        return "not_connected"

    expires_at = _parse_optional_datetime(settings_map.get("vk_token_expires_at"))
    if expires_at is not None and expires_at <= datetime.now(timezone.utc):
        return "expired"

    return "connected"


def _parse_optional_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _mask_secret(value: str | None) -> str | None:
    if value is None:
        return None
    if len(value) <= 6:
        return "***"
    return f"{value[:3]}***{value[-3:]}"


def _is_masked_update(value: str, existing_raw: str | None) -> bool:
    if value == "***":
        return True
    if existing_raw is None:
        return False
    return value == _mask_secret(existing_raw)
