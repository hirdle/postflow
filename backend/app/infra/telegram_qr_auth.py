from __future__ import annotations

import asyncio
import base64
import contextlib
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any, Awaitable, Callable
from uuid import uuid4

import qrcode
from telethon import TelegramClient, errors

from app.infra.telegram_client import TelegramAuthSettings, load_telegram_auth_settings

TelegramQrStatus = str
SettingsLoader = Callable[[Path | None], Awaitable[TelegramAuthSettings]]
ClientFactory = Callable[[TelegramAuthSettings], Any]
QrRenderer = Callable[[str], str]


@dataclass(frozen=True, slots=True)
class TelegramQrAuthSnapshot:
    session_id: str
    status: TelegramQrStatus
    started_at: datetime
    expires_at: datetime | None
    qr_url: str | None
    qr_image_data_url: str | None
    error: str | None
    account_label: str | None


@dataclass(slots=True)
class TelegramQrAuthFlow:
    session_id: str
    status: TelegramQrStatus
    started_at: datetime
    expires_at: datetime | None
    qr_url: str | None
    qr_image_data_url: str | None
    error: str | None
    account_label: str | None
    client: Any | None = None
    qr_login: Any | None = None
    waiter_task: asyncio.Task[None] | None = None

    def snapshot(self) -> TelegramQrAuthSnapshot:
        return TelegramQrAuthSnapshot(
            session_id=self.session_id,
            status=self.status,
            started_at=self.started_at,
            expires_at=self.expires_at,
            qr_url=self.qr_url,
            qr_image_data_url=self.qr_image_data_url,
            error=self.error,
            account_label=self.account_label,
        )


class TelegramQrAuthManager:
    def __init__(
        self,
        *,
        settings_loader: SettingsLoader = load_telegram_auth_settings,
        client_factory: ClientFactory | None = None,
        qr_renderer: QrRenderer | None = None,
    ) -> None:
        self._settings_loader = settings_loader
        self._client_factory = client_factory or _build_telegram_auth_client
        self._qr_renderer = qr_renderer or _render_qr_image_data_url
        self._lock = asyncio.Lock()
        self._flows: dict[str, TelegramQrAuthFlow] = {}

    async def start(self, db_path: Path | None = None) -> TelegramQrAuthSnapshot:
        await self._clear_flows()

        settings = await self._settings_loader(db_path)
        client = self._client_factory(settings)
        await client.connect()

        try:
            if await client.is_user_authorized():
                user = await client.get_me()
                flow = TelegramQrAuthFlow(
                    session_id=uuid4().hex,
                    status="authorized",
                    started_at=_utcnow(),
                    expires_at=None,
                    qr_url=None,
                    qr_image_data_url=None,
                    error=None,
                    account_label=_format_account_label(user),
                )
                await self._replace_flow(flow)
                await _safe_disconnect(client)
                return flow.snapshot()

            qr_login = await client.qr_login()
            flow = TelegramQrAuthFlow(
                session_id=uuid4().hex,
                status="waiting_for_scan",
                started_at=_utcnow(),
                expires_at=qr_login.expires,
                qr_url=qr_login.url,
                qr_image_data_url=self._qr_renderer(qr_login.url),
                error=None,
                account_label=None,
                client=client,
                qr_login=qr_login,
            )
            await self._replace_flow(flow)
            flow.waiter_task = asyncio.create_task(self._wait_for_scan(flow.session_id))
            return flow.snapshot()
        except Exception:
            await _safe_disconnect(client)
            raise

    async def get(self, session_id: str) -> TelegramQrAuthSnapshot:
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)
            return flow.snapshot()

    async def submit_password(
        self,
        session_id: str,
        password: str,
    ) -> TelegramQrAuthSnapshot:
        normalized_password = password.strip()
        if not normalized_password:
            raise ValueError("Telegram 2FA password must not be empty.")

        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)
            if flow.status != "password_required" or flow.client is None:
                raise RuntimeError("Telegram session is not waiting for a password.")
            client = flow.client

        try:
            await client.sign_in(password=normalized_password)
        except errors.PasswordHashInvalidError as exc:
            await self._patch_flow(
                session_id,
                error="Telegram 2FA password is invalid.",
            )
            raise ValueError("Telegram 2FA password is invalid.") from exc
        except Exception as exc:
            await self._finalize_flow(
                session_id,
                status="failed",
                error=_format_unexpected_error(exc),
            )
            raise RuntimeError(_format_unexpected_error(exc)) from exc

        me = await client.get_me()
        return await self._finalize_flow(
            session_id,
            status="authorized",
            error=None,
            account_label=_format_account_label(me),
        )

    async def cancel(self, session_id: str) -> TelegramQrAuthSnapshot:
        return await self._finalize_flow(
            session_id,
            status="cancelled",
            error=None,
            clear_qr=True,
        )

    async def shutdown(self) -> None:
        async with self._lock:
            flows = list(self._flows.values())
            self._flows.clear()

        await asyncio.gather(
            *(self._stop_flow(flow) for flow in flows),
            return_exceptions=True,
        )

    async def _wait_for_scan(self, session_id: str) -> None:
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None or flow.qr_login is None:
                return
            qr_login = flow.qr_login

        try:
            user = await qr_login.wait()
        except errors.SessionPasswordNeededError:
            await self._patch_flow(
                session_id,
                status="password_required",
                expires_at=None,
                qr_url=None,
                qr_image_data_url=None,
                error=None,
                qr_login=None,
                waiter_task=None,
            )
            return
        except asyncio.TimeoutError:
            await self._finalize_flow(
                session_id,
                status="expired",
                error="QR code expired. Start a new Telegram session.",
            )
            return
        except asyncio.CancelledError:
            return
        except Exception as exc:
            await self._finalize_flow(
                session_id,
                status="failed",
                error=_format_unexpected_error(exc),
            )
            return

        await self._finalize_flow(
            session_id,
            status="authorized",
            error=None,
            account_label=_format_account_label(user),
        )

    async def _replace_flow(self, flow: TelegramQrAuthFlow) -> None:
        async with self._lock:
            self._flows = {flow.session_id: flow}

    async def _clear_flows(self) -> None:
        async with self._lock:
            flows = list(self._flows.values())
            self._flows.clear()

        await asyncio.gather(
            *(self._stop_flow(flow) for flow in flows),
            return_exceptions=True,
        )

    async def _finalize_flow(
        self,
        session_id: str,
        *,
        status: TelegramQrStatus,
        error: str | None,
        account_label: str | None = None,
        clear_qr: bool = True,
    ) -> TelegramQrAuthSnapshot:
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)

            waiter_task = flow.waiter_task
            client = flow.client
            flow.status = status
            flow.error = error
            flow.account_label = account_label
            flow.waiter_task = None
            flow.client = None
            flow.qr_login = None
            flow.expires_at = None if clear_qr else flow.expires_at
            flow.qr_url = None if clear_qr else flow.qr_url
            flow.qr_image_data_url = None if clear_qr else flow.qr_image_data_url
            snapshot = flow.snapshot()

        if waiter_task is not None and waiter_task is not asyncio.current_task():
            waiter_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await waiter_task

        await _safe_disconnect(client)
        return snapshot

    async def _patch_flow(self, session_id: str, **changes: Any) -> TelegramQrAuthSnapshot:
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)

            for key, value in changes.items():
                setattr(flow, key, value)

            return flow.snapshot()

    async def _stop_flow(self, flow: TelegramQrAuthFlow) -> None:
        waiter_task = flow.waiter_task
        if waiter_task is not None:
            waiter_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await waiter_task
        await _safe_disconnect(flow.client)


def _build_telegram_auth_client(settings: TelegramAuthSettings) -> TelegramClient:
    return TelegramClient(
        str(settings.session_path),
        settings.api_id,
        settings.api_hash,
        device_model="iPhone 15 Pro",
        system_version="17.4",
        app_version="10.8.1",
    )


def _render_qr_image_data_url(url: str) -> str:
    qr = qrcode.QRCode(border=1, box_size=8)
    qr.add_data(url)
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _format_account_label(user: Any) -> str:
    parts = [getattr(user, "first_name", None), getattr(user, "last_name", None)]
    name = " ".join(part for part in parts if part).strip()
    username = getattr(user, "username", None)
    if username:
        suffix = f"@{username}"
        return f"{name} ({suffix})" if name else suffix
    return name or "Telegram account connected"


def _format_unexpected_error(error: Exception) -> str:
    message = str(error).strip()
    return message or error.__class__.__name__


async def _safe_disconnect(client: Any | None) -> None:
    if client is None or not hasattr(client, "disconnect"):
        return
    await client.disconnect()


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


@lru_cache(maxsize=1)
def get_telegram_qr_auth_manager() -> TelegramQrAuthManager:
    return TelegramQrAuthManager()
