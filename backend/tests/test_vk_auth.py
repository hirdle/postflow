from __future__ import annotations

import json
import unittest
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from app.infra.vk_auth import VkAuthManager, _utcnow


class FakeResponse:
    def __init__(self, payload, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeHttpClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict | None]] = []

    async def post(self, url: str, data=None, files=None):  # noqa: ANN001
        self.calls.append((url, data))

        if url.endswith("/auth"):
            return FakeResponse(
                {
                    "access_token": "vk-access-token",
                    "refresh_token": "vk-refresh-token",
                    "expires_in": 3600,
                    "scope": "wall photos groups offline",
                }
            )

        if url.endswith("/user_info"):
            return FakeResponse(
                {
                    "user": {
                        "user_id": "12345",
                        "first_name": "Bio",
                        "last_name": "Volt",
                    }
                }
            )

        if url.endswith("/groups.get"):
            role = (data or {}).get("filter")
            if role == "admin":
                return FakeResponse(
                    {
                        "response": {
                            "count": 1,
                            "items": [
                                {
                                    "id": 77,
                                    "name": "BioVolt",
                                    "screen_name": "biovolt",
                                    "can_post": 1,
                                }
                            ],
                        }
                    }
                )
            return FakeResponse(
                {
                    "response": {
                        "count": 1,
                        "items": [
                            {
                                "id": 88,
                                "name": "BioVolt Editors",
                                "screen_name": "biovolt_editors",
                                "can_post": 1,
                            }
                        ],
                    }
                }
            )

        raise AssertionError(f"Unexpected request: {url} {json.dumps(data or {})}")


class VkAuthManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_start_returns_waiting_snapshot_with_authorize_url(self) -> None:
        manager = VkAuthManager(http_client=FakeHttpClient())

        with patch(
            "app.infra.vk_auth._load_vk_client_id",
            AsyncMock(return_value="51699339"),
        ):
            snapshot = await manager.start("http://localhost:3000/settings/vk/callback")

        self.assertEqual(snapshot.status, "waiting_for_callback")
        self.assertIsNotNone(snapshot.authorize_url)
        self.assertIn("client_id=51699339", snapshot.authorize_url or "")
        self.assertIn("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fsettings%2Fvk%2Fcallback", snapshot.authorize_url or "")

    async def test_exchange_authorizes_and_persists_vk_result(self) -> None:
        http_client = FakeHttpClient()
        manager = VkAuthManager(http_client=http_client)
        persisted_payloads: list[dict[str, str | None]] = []

        with patch(
            "app.infra.vk_auth._load_vk_client_id",
            AsyncMock(return_value="51699339"),
        ):
            snapshot = await manager.start("http://localhost:3000/settings/vk/callback")

        flow = manager._flows[snapshot.session_id]

        with (
            patch(
                "app.infra.vk_auth.load_vk_settings_map",
                AsyncMock(return_value={"vk_group_id": None, "vk_group_name": None}),
            ),
            patch(
                "app.infra.vk_auth.upsert_vk_settings",
                AsyncMock(side_effect=lambda values: persisted_payloads.append(values)),
            ),
            patch(
                "app.infra.vk_auth.delete_vk_settings",
                AsyncMock(),
            ),
        ):
            authorized = await manager.exchange(
                snapshot.session_id,
                {
                    "code": "vk-code",
                    "state": flow.state,
                    "device_id": "device-123",
                },
            )

        self.assertEqual(authorized.status, "authorized")
        self.assertEqual(authorized.account_label, "Bio Volt (VK ID 12345)")
        self.assertEqual(len(authorized.communities), 2)
        self.assertEqual(persisted_payloads[0]["vk_access_token"], "vk-access-token")
        self.assertEqual(persisted_payloads[0]["vk_user_id"], "12345")

    async def test_exchange_rejects_state_mismatch(self) -> None:
        manager = VkAuthManager(http_client=FakeHttpClient())

        with patch(
            "app.infra.vk_auth._load_vk_client_id",
            AsyncMock(return_value="51699339"),
        ):
            snapshot = await manager.start("http://localhost:3000/settings/vk/callback")

        with self.assertRaisesRegex(ValueError, "state mismatch"):
            await manager.exchange(
                snapshot.session_id,
                {
                    "code": "vk-code",
                    "state": "wrong-state",
                    "device_id": "device-123",
                },
            )

        failed = await manager.get(snapshot.session_id)
        self.assertEqual(failed.status, "failed")

    async def test_get_marks_expired_session(self) -> None:
        manager = VkAuthManager(http_client=FakeHttpClient())

        with patch(
            "app.infra.vk_auth._load_vk_client_id",
            AsyncMock(return_value="51699339"),
        ):
            snapshot = await manager.start("http://localhost:3000/settings/vk/callback")

        manager._flows[snapshot.session_id].expires_at = _utcnow() - timedelta(seconds=1)

        expired = await manager.get(snapshot.session_id)

        self.assertEqual(expired.status, "expired")
        self.assertIsNone(expired.authorize_url)
