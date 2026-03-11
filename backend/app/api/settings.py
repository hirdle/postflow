from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.infra.telegram_qr_auth import get_telegram_qr_auth_manager
from app.infra.database import get_db
from app.schemas.settings import (
    SettingsResponse,
    SettingsUpdate,
    TelegramSessionPasswordRequest,
    TelegramSessionResponse,
)

router = APIRouter(prefix="/settings", tags=["settings"])

SETTINGS_KEYS = (
    "telegram_api_id",
    "telegram_api_hash",
    "telegram_session_path",
    "telegram_channel",
    "vk_access_token",
    "vk_group_id",
    "image_api_key",
    "image_base_url",
    "image_default_model",
)

SECRET_KEYS = {
    "telegram_api_id",
    "telegram_api_hash",
    "vk_access_token",
    "image_api_key",
}


@router.get("", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    settings_map = await _load_settings_map()
    return SettingsResponse(**_mask_settings(settings_map))


@router.put("", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdate) -> SettingsResponse:
    incoming = payload.model_dump(exclude_unset=True)
    existing = await _load_settings_map()

    async with get_db() as db:
        for key, value in incoming.items():
            normalized = value.strip() if isinstance(value, str) else value
            if normalized in (None, ""):
                continue
            if key in SECRET_KEYS and _is_masked_update(normalized, existing.get(key)):
                continue

            await db.execute(
                """
                INSERT INTO app_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, normalized),
            )
        await db.commit()

    refreshed = await _load_settings_map()
    return SettingsResponse(**_mask_settings(refreshed))


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


async def _load_settings_map() -> dict[str, str | None]:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN ({})".format(
                ", ".join("?" for _ in SETTINGS_KEYS)
            ),
            SETTINGS_KEYS,
        )
        rows = await cursor.fetchall()

    values = {key: None for key in SETTINGS_KEYS}
    values.update({row["key"]: row["value"] for row in rows})
    return values


def _mask_settings(settings_map: dict[str, str | None]) -> dict[str, str | None]:
    masked: dict[str, str | None] = {}
    for key, value in settings_map.items():
        if key in SECRET_KEYS:
            masked[key] = _mask_secret(value)
        else:
            masked[key] = value
    return masked


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
