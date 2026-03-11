from __future__ import annotations

import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from telethon import errors

from app.infra.telegram_client import TelegramAuthSettings
from app.infra.telegram_qr_auth import TelegramQrAuthManager


class FakeQrLogin:
    def __init__(
        self,
        *,
        url: str = "tg://login?token=test",
        expires: datetime | None = None,
        result: object | None = None,
        error: Exception | None = None,
        pending: bool = False,
    ) -> None:
        self.url = url
        self.expires = expires or datetime.now(timezone.utc) + timedelta(minutes=5)
        self._result = result
        self._error = error
        self._pending = pending
        self.wait_calls = 0

    async def wait(self):
        self.wait_calls += 1
        if self._error is not None:
            raise self._error
        if self._pending:
            await asyncio.Event().wait()
        return self._result


class FakeClient:
    def __init__(
        self,
        *,
        authorized: bool,
        user: object | None = None,
        qr_login_result: FakeQrLogin | None = None,
    ) -> None:
        self.authorized = authorized
        self.user = user or SimpleNamespace(first_name="BioVolt", username="biovolt")
        self.qr_login_result = qr_login_result
        self.connect_calls = 0
        self.disconnect_calls = 0
        self.qr_login_calls = 0
        self.sign_in_passwords: list[str] = []

    async def connect(self) -> None:
        self.connect_calls += 1

    async def disconnect(self) -> None:
        self.disconnect_calls += 1

    async def is_user_authorized(self) -> bool:
        return self.authorized

    async def get_me(self):
        return self.user

    async def qr_login(self):
        self.qr_login_calls += 1
        if self.qr_login_result is None:
            raise AssertionError("qr_login_result must be provided for this test.")
        return self.qr_login_result

    async def sign_in(self, *, password: str) -> None:
        self.sign_in_passwords.append(password)
        self.authorized = True


class TelegramQrAuthManagerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self) -> None:
        manager = getattr(self, "manager", None)
        if manager is not None:
            await manager.shutdown()

    async def test_start_returns_waiting_snapshot_with_qr_payload(self) -> None:
        client = FakeClient(
            authorized=False,
            qr_login_result=FakeQrLogin(pending=True),
        )
        self.manager = self._build_manager(client)

        snapshot = await self.manager.start()

        self.assertEqual(snapshot.status, "waiting_for_scan")
        self.assertEqual(snapshot.qr_url, "tg://login?token=test")
        self.assertEqual(snapshot.qr_image_data_url, "qr::tg://login?token=test")
        self.assertIsNotNone(snapshot.expires_at)
        self.assertEqual(client.connect_calls, 1)
        self.assertEqual(client.disconnect_calls, 0)

    async def test_waiter_moves_flow_to_password_required_and_password_finalizes(self) -> None:
        client = FakeClient(
            authorized=False,
            qr_login_result=FakeQrLogin(
                error=errors.SessionPasswordNeededError(request=None),
            ),
        )
        self.manager = self._build_manager(client)

        snapshot = await self.manager.start()
        await self._flush_tasks()

        pending = await self.manager.get(snapshot.session_id)
        self.assertEqual(pending.status, "password_required")
        self.assertIsNone(pending.qr_url)
        self.assertEqual(client.disconnect_calls, 0)

        authorized = await self.manager.submit_password(snapshot.session_id, "secret")

        self.assertEqual(authorized.status, "authorized")
        self.assertEqual(authorized.account_label, "BioVolt (@biovolt)")
        self.assertEqual(client.sign_in_passwords, ["secret"])
        self.assertEqual(client.disconnect_calls, 1)

    async def test_start_reuses_existing_authorized_session_without_qr(self) -> None:
        client = FakeClient(authorized=True)
        self.manager = self._build_manager(client)

        snapshot = await self.manager.start()

        self.assertEqual(snapshot.status, "authorized")
        self.assertIsNone(snapshot.qr_url)
        self.assertEqual(snapshot.account_label, "BioVolt (@biovolt)")
        self.assertEqual(client.qr_login_calls, 0)
        self.assertEqual(client.disconnect_calls, 1)

    def _build_manager(self, client: FakeClient) -> TelegramQrAuthManager:
        async def load_settings(_: Path | None = None) -> TelegramAuthSettings:
            return TelegramAuthSettings(
                api_id=1,
                api_hash="hash",
                session_path=Path("/tmp/postflow-test"),
            )

        return TelegramQrAuthManager(
            settings_loader=load_settings,
            client_factory=lambda _: client,
            qr_renderer=lambda url: f"qr::{url}",
        )

    async def _flush_tasks(self) -> None:
        await asyncio.sleep(0)
        await asyncio.sleep(0)
