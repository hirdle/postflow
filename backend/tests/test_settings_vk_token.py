from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from app.api.settings import _connect_vk_token, _parse_vk_token_input
from app.infra.vk_client import VKCommunity, VKUserProfile


class VkTokenHelperTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_vk_token_input_accepts_blank_html_url(self) -> None:
        parsed = _parse_vk_token_input(
            "https://oauth.vk.com/blank.html#access_token=vk-token&expires_in=3600&user_id=42"
        )

        self.assertEqual(parsed.access_token, "vk-token")
        self.assertIsNotNone(parsed.token_expires_at)
        self.assertGreater(parsed.token_expires_at or datetime.min.replace(tzinfo=timezone.utc), datetime.now(timezone.utc))

    def test_parse_vk_token_input_rejects_callback_url_without_token(self) -> None:
        with self.assertRaisesRegex(ValueError, "does not contain access_token"):
            _parse_vk_token_input("https://oauth.vk.com/blank.html#error=access_denied")

    async def test_connect_vk_token_validates_and_persists_account(self) -> None:
        communities = [
            VKCommunity(
                group_id="77",
                name="BioVolt",
                screen_name="biovolt",
                role="admin",
                can_post=True,
            )
        ]

        with (
            patch(
                "app.api.settings._load_settings_map",
                AsyncMock(return_value={"vk_client_id": "51699339"}),
            ),
            patch(
                "app.api.settings.VKClient.ensure_required_permissions",
                AsyncMock(return_value="groups offline photos wall"),
            ),
            patch(
                "app.api.settings.VKClient.get_profile",
                AsyncMock(
                    return_value=VKUserProfile(
                        user_id="12345",
                        first_name="Bio",
                        last_name="Volt",
                    )
                ),
            ),
            patch(
                "app.api.settings.VKClient.list_communities",
                AsyncMock(return_value=communities),
            ),
            patch("app.api.settings.VKClient.close", AsyncMock()),
            patch(
                "app.api.settings._persist_vk_manual_token_result",
                AsyncMock(),
            ) as persist_mock,
        ):
            result = await _connect_vk_token(
                "https://oauth.vk.com/blank.html#access_token=vk-token&expires_in=0&user_id=42"
            )

        self.assertEqual(result, communities)
        self.assertEqual(persist_mock.await_count, 1)
        persisted = persist_mock.await_args.kwargs
        self.assertEqual(persisted["access_token"], "vk-token")
        self.assertEqual(persisted["scope"], "groups offline photos wall")
        self.assertEqual(persisted["user_id"], "12345")
        self.assertEqual(persisted["account_label"], "Bio Volt (VK ID 12345)")
