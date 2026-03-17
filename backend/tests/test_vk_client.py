from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.infra.database import initialize_database
from app.infra.vk_client import VKClient, load_vk_settings_map


class FakeResponse:
    def __init__(self, payload, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class RefreshingHttpClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict | None]] = []
        self.wall_delete_attempts = 0

    async def post(self, url: str, data=None, files=None):  # noqa: ANN001
        self.calls.append((url, data))

        if url.endswith("/wall.delete"):
            self.wall_delete_attempts += 1
            if (data or {}).get("access_token") == "old-access-token":
                return FakeResponse(
                    {
                        "error": {
                            "error_code": 5,
                            "error_msg": "User authorization failed",
                        }
                    }
                )
            return FakeResponse({"response": 1})

        if url.endswith("/auth"):
            return FakeResponse(
                {
                    "access_token": "new-access-token",
                    "refresh_token": "new-refresh-token",
                    "expires_in": 7200,
                    "scope": "wall photos groups offline",
                }
            )

        raise AssertionError(f"Unexpected request: {url} {data}")


class CommunitiesHttpClient:
    async def post(self, url: str, data=None, files=None):  # noqa: ANN001
        if not url.endswith("/groups.get"):
            raise AssertionError(f"Unexpected request: {url} {data}")

        role = (data or {}).get("filter")
        if role == "admin":
            return FakeResponse(
                {
                    "response": {
                        "count": 2,
                        "items": [
                            {
                                "id": 77,
                                "name": "BioVolt",
                                "screen_name": "biovolt",
                                "can_post": 1,
                            },
                            {
                                "id": 99,
                                "name": "BioVolt Alpha",
                                "screen_name": "alpha",
                                "can_post": 0,
                            },
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
                            "screen_name": "editors",
                            "can_post": 1,
                        }
                    ],
                }
            }
        )


class PermissionsHttpClient:
    async def post(self, url: str, data=None, files=None):  # noqa: ANN001
        if url.endswith("/account.getAppPermissions"):
            return FakeResponse({"response": 335876})
        raise AssertionError(f"Unexpected request: {url} {data}")


class MissingWallPermissionsHttpClient:
    async def post(self, url: str, data=None, files=None):  # noqa: ANN001
        if url.endswith("/account.getAppPermissions"):
            return FakeResponse({"response": 327684})
        raise AssertionError(f"Unexpected request: {url} {data}")


class InvalidTokenHttpClient:
    async def post(self, url: str, data=None, files=None):  # noqa: ANN001
        return FakeResponse(
            {
                "error": {
                    "error_code": 5,
                    "error_msg": "User authorization failed",
                }
            }
        )


class VKClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_access_token_persists_new_credentials_and_retries_request(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "publish.db"
            await initialize_database(db_path)

            client = VKClient(
                access_token="old-access-token",
                group_id="77",
                client_id="51699339",
                refresh_token="refresh-token",
                device_id="device-123",
                http_client=RefreshingHttpClient(),
                db_path=db_path,
            )

            deleted = await client.delete_post(10)
            stored = await load_vk_settings_map(
                ("vk_access_token", "vk_refresh_token", "vk_token_scope"),
                db_path,
            )

        self.assertTrue(deleted)
        self.assertEqual(client.access_token, "new-access-token")
        self.assertEqual(stored["vk_access_token"], "new-access-token")
        self.assertEqual(stored["vk_refresh_token"], "new-refresh-token")
        self.assertEqual(stored["vk_token_scope"], "wall photos groups offline")

    async def test_list_communities_merges_roles_and_validate_access(self) -> None:
        client = VKClient(
            access_token="vk-token",
            http_client=CommunitiesHttpClient(),
        )

        communities = await client.list_communities()
        selected = await client.validate_community_access("77")

        self.assertEqual(
            [community.group_id for community in communities],
            ["77", "99", "88"],
        )
        self.assertEqual(selected.name, "BioVolt")
        self.assertEqual(selected.role, "admin")

        with self.assertRaisesRegex(ValueError, "does not allow wall posting"):
            await client.validate_community_access("99")

    async def test_ensure_required_permissions_reads_permission_bitmask(self) -> None:
        client = VKClient(
            access_token="vk-token",
            http_client=PermissionsHttpClient(),
        )

        granted_scope = await client.ensure_required_permissions()

        self.assertEqual(granted_scope, "groups offline photos wall")
        self.assertEqual(client.token_scope, "groups offline photos wall")

    async def test_ensure_required_permissions_reports_granted_scopes_and_bitmask(self) -> None:
        client = VKClient(
            access_token="vk-token",
            http_client=MissingWallPermissionsHttpClient(),
        )

        with self.assertRaisesRegex(
            RuntimeError,
            r"missing required scopes: wall\. Granted scopes: groups offline photos\. Permissions bitmask: 327684\.",
        ):
            await client.ensure_required_permissions()

    async def test_expired_token_refreshes_before_request(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "publish.db"
            await initialize_database(db_path)
            http_client = RefreshingHttpClient()

            client = VKClient(
                access_token="old-access-token",
                group_id="77",
                client_id="51699339",
                refresh_token="refresh-token",
                device_id="device-123",
                token_expires_at=datetime.now(timezone.utc) - timedelta(seconds=5),
                http_client=http_client,
                db_path=db_path,
            )

            deleted = await client.delete_post(10)

        self.assertTrue(deleted)
        self.assertEqual(http_client.wall_delete_attempts, 1)

    async def test_invalid_token_without_refresh_metadata_reports_reconnect(self) -> None:
        client = VKClient(
            access_token="bad-token",
            http_client=InvalidTokenHttpClient(),
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "VK access token is invalid or expired. Reconnect VK in settings.",
        ):
            await client.get_app_permissions()
