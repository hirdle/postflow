from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from app.infra.database import get_db

VK_SETTINGS_KEYS = (
    "vk_access_token",
    "vk_group_id",
)
VK_API_VERSION = "5.199"
VK_API_BASE = "https://api.vk.com/method"
MSK = timezone(timedelta(hours=3))


@dataclass(frozen=True, slots=True)
class VKSettings:
    access_token: str
    group_id: str


async def load_vk_settings(db_path: Path | None = None) -> VKSettings:
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
            VK_SETTINGS_KEYS,
        )
        rows = await cursor.fetchall()

    settings_map = {key: None for key in VK_SETTINGS_KEYS}
    settings_map.update({row["key"]: row["value"] for row in rows})

    access_token = (settings_map["vk_access_token"] or "").strip()
    group_id = (settings_map["vk_group_id"] or "").strip()

    if not access_token:
        raise ValueError("VK access token is not configured in app_settings.")
    if not group_id:
        raise ValueError("VK group ID is not configured in app_settings.")

    return VKSettings(
        access_token=access_token,
        group_id=group_id,
    )


class VKClient:
    def __init__(
        self,
        access_token: str,
        group_id: str,
        http_client: Any | None = None,
        api_base: str = VK_API_BASE,
        api_version: str = VK_API_VERSION,
    ) -> None:
        normalized_token = access_token.strip()
        normalized_group_id = group_id.strip()
        normalized_api_base = api_base.rstrip("/")
        normalized_api_version = api_version.strip() or VK_API_VERSION

        if not normalized_token:
            raise ValueError("access_token must not be empty.")
        if not normalized_group_id:
            raise ValueError("group_id must not be empty.")

        self.access_token = normalized_token
        self.group_id = normalized_group_id
        self.api_base = normalized_api_base
        self.api_version = normalized_api_version
        self._http = http_client or httpx.AsyncClient(timeout=30)
        self._owns_client = http_client is None

    @classmethod
    async def from_settings(
        cls,
        db_path: Path | None = None,
        http_client: Any | None = None,
    ) -> VKClient:
        settings = await load_vk_settings(db_path)
        return cls(
            access_token=settings.access_token,
            group_id=settings.group_id,
            http_client=http_client,
        )

    async def create_poll(
        self,
        question: str,
        options: list[str],
        is_anonymous: bool = True,
    ) -> int:
        normalized_question = question.strip()
        normalized_options = [option.strip() for option in options if option.strip()]
        if not normalized_question:
            raise ValueError("question must not be empty.")
        if not 2 <= len(normalized_options) <= 10:
            raise ValueError("Poll options must contain between 2 and 10 items.")

        result = await self._call(
            "polls.create",
            owner_id=f"-{self.group_id}",
            question=normalized_question,
            add_answers=json.dumps(normalized_options, ensure_ascii=False),
            is_anonymous=int(is_anonymous),
        )
        return int(result["id"])

    async def upload_photo(self, image_path: str | Path) -> str:
        resolved_image_path = Path(image_path)
        upload_server = await self._call(
            "photos.getWallUploadServer",
            group_id=self.group_id,
        )
        upload_url = upload_server["upload_url"]

        with resolved_image_path.open("rb") as image_file:
            response = await self._http.post(
                upload_url,
                files={"photo": image_file},
            )
        response.raise_for_status()
        upload_payload = response.json()

        saved = await self._call(
            "photos.saveWallPhoto",
            group_id=self.group_id,
            photo=upload_payload["photo"],
            server=upload_payload["server"],
            hash=upload_payload["hash"],
        )
        photo = saved[0]
        return f"photo{photo['owner_id']}_{photo['id']}"

    async def wall_post(
        self,
        message: str,
        attachments: list[str] | None = None,
        publish_date: str | None = None,
        publish_time: str | None = None,
    ) -> int:
        params: dict[str, object] = {
            "owner_id": f"-{self.group_id}",
            "from_group": 1,
            "message": message,
        }

        if attachments:
            params["attachments"] = ",".join(attachments)

        publish_timestamp = _build_publish_timestamp(publish_date, publish_time)
        if publish_timestamp is not None:
            params["publish_date"] = publish_timestamp

        result = await self._call("wall.post", **params)
        return int(result["post_id"])

    async def delete_post(self, post_id: int) -> bool:
        await self._call(
            "wall.delete",
            owner_id=f"-{self.group_id}",
            post_id=post_id,
        )
        return True

    async def close(self) -> None:
        if self._owns_client and hasattr(self._http, "aclose"):
            await self._http.aclose()
        elif hasattr(self._http, "aclose"):
            await self._http.aclose()

    async def _call(self, method: str, **params: object) -> dict[str, Any]:
        response = await self._http.post(
            f"{self.api_base}/{method}",
            data={
                **params,
                "access_token": self.access_token,
                "v": self.api_version,
            },
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            error = payload["error"]
            raise RuntimeError(
                f"VK API error: {error.get('error_msg', error)}"
            )
        return payload["response"]


def _build_publish_timestamp(
    publish_date: str | None,
    publish_time: str | None,
) -> int | None:
    if not publish_date and not publish_time:
        return None
    if not publish_date or not publish_time:
        raise ValueError("publish_date and publish_time must be provided together.")

    scheduled_at = datetime.strptime(
        f"{publish_date} {publish_time}",
        "%Y-%m-%d %H:%M",
    )
    return int(scheduled_at.replace(tzinfo=MSK).timestamp())
