from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

import httpx

from app.infra.database import get_db

VK_SETTINGS_KEYS = (
    "vk_access_token",
    "vk_group_id",
    "vk_group_name",
    "vk_client_id",
    "vk_refresh_token",
    "vk_user_id",
    "vk_token_expires_at",
    "vk_token_scope",
    "vk_account_label",
    "vk_device_id",
)
VK_AUTH_SETTINGS_KEYS = (
    "vk_access_token",
    "vk_client_id",
    "vk_refresh_token",
    "vk_device_id",
    "vk_token_expires_at",
    "vk_token_scope",
)
VK_API_VERSION = "5.199"
VK_API_BASE = "https://api.vk.com/method"
VK_ID_AUTHORIZE_BASE = "https://id.vk.ru/authorize"
VK_ID_OAUTH_BASE = "https://id.vk.ru/oauth2"
VK_ID_TOKEN_URL = f"{VK_ID_OAUTH_BASE}/auth"
VK_ID_LOGOUT_URL = f"{VK_ID_OAUTH_BASE}/logout"
VK_ID_USER_INFO_URL = f"{VK_ID_OAUTH_BASE}/user_info"
VK_REQUIRED_SCOPES = frozenset({"wall", "photos", "groups"})
VK_OPTIONAL_SCOPES = frozenset({"offline"})
MSK = timezone(timedelta(hours=3))


@dataclass(frozen=True, slots=True)
class VKSettings:
    access_token: str
    group_id: str
    group_name: str | None = None
    client_id: str | None = None
    refresh_token: str | None = None
    user_id: str | None = None
    token_expires_at: datetime | None = None
    token_scope: str | None = None
    account_label: str | None = None
    device_id: str | None = None


@dataclass(frozen=True, slots=True)
class VKUserProfile:
    user_id: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None

    @property
    def account_label(self) -> str:
        full_name = " ".join(part for part in [self.first_name, self.last_name] if part)
        if full_name:
            return f"{full_name} (VK ID {self.user_id})"
        return f"VK ID {self.user_id}"


@dataclass(frozen=True, slots=True)
class VKCommunity:
    group_id: str
    name: str
    screen_name: str | None
    role: str
    can_post: bool


async def load_vk_settings(db_path: Path | None = None) -> VKSettings:
    settings_map = await load_vk_settings_map(VK_SETTINGS_KEYS, db_path)
    access_token = _get_required_setting(
        settings_map,
        "vk_access_token",
        "VK access token is not configured in app_settings.",
    )
    group_id = _get_required_setting(
        settings_map,
        "vk_group_id",
        "VK group ID is not configured in app_settings.",
    )

    return VKSettings(
        access_token=access_token,
        group_id=group_id,
        group_name=_normalize_optional_setting(settings_map, "vk_group_name"),
        client_id=_normalize_optional_setting(settings_map, "vk_client_id"),
        refresh_token=_normalize_optional_setting(settings_map, "vk_refresh_token"),
        user_id=_normalize_optional_setting(settings_map, "vk_user_id"),
        token_expires_at=_parse_optional_datetime(settings_map.get("vk_token_expires_at")),
        token_scope=_normalize_optional_setting(settings_map, "vk_token_scope"),
        account_label=_normalize_optional_setting(settings_map, "vk_account_label"),
        device_id=_normalize_optional_setting(settings_map, "vk_device_id"),
    )


async def load_vk_settings_map(
    keys: Sequence[str],
    db_path: Path | None = None,
) -> dict[str, str | None]:
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN ({})".format(
                ", ".join("?" for _ in keys)
            ),
            tuple(keys),
        )
        rows = await cursor.fetchall()

    settings_map = {key: None for key in keys}
    settings_map.update({row["key"]: row["value"] for row in rows})
    return settings_map


async def upsert_vk_settings(
    values: dict[str, str | None],
    db_path: Path | None = None,
) -> None:
    async with get_db(db_path) as db:
        for key, value in values.items():
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


async def delete_vk_settings(
    keys: Iterable[str],
    db_path: Path | None = None,
) -> None:
    normalized_keys = tuple(keys)
    if not normalized_keys:
        return

    async with get_db(db_path) as db:
        await db.execute(
            "DELETE FROM app_settings WHERE key IN ({})".format(
                ", ".join("?" for _ in normalized_keys)
            ),
            normalized_keys,
        )
        await db.commit()


class VKClient:
    def __init__(
        self,
        access_token: str,
        group_id: str | None = None,
        *,
        group_name: str | None = None,
        client_id: str | None = None,
        refresh_token: str | None = None,
        device_id: str | None = None,
        token_expires_at: datetime | None = None,
        token_scope: str | None = None,
        http_client: Any | None = None,
        api_base: str = VK_API_BASE,
        api_version: str = VK_API_VERSION,
        db_path: Path | None = None,
    ) -> None:
        normalized_token = access_token.strip()
        normalized_group_id = group_id.strip() if isinstance(group_id, str) else None
        normalized_api_base = api_base.rstrip("/")
        normalized_api_version = api_version.strip() or VK_API_VERSION

        if not normalized_token:
            raise ValueError("access_token must not be empty.")

        self.access_token = normalized_token
        self.group_id = normalized_group_id
        self.group_name = group_name.strip() if isinstance(group_name, str) and group_name.strip() else None
        self.client_id = client_id.strip() if isinstance(client_id, str) and client_id.strip() else None
        self.refresh_token = (
            refresh_token.strip()
            if isinstance(refresh_token, str) and refresh_token.strip()
            else None
        )
        self.device_id = device_id.strip() if isinstance(device_id, str) and device_id.strip() else None
        self.token_expires_at = token_expires_at
        self.token_scope = token_scope.strip() if isinstance(token_scope, str) and token_scope.strip() else None
        self.api_base = normalized_api_base
        self.api_version = normalized_api_version
        self.db_path = db_path
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
            group_name=settings.group_name,
            client_id=settings.client_id,
            refresh_token=settings.refresh_token,
            device_id=settings.device_id,
            token_expires_at=settings.token_expires_at,
            token_scope=settings.token_scope,
            http_client=http_client,
            db_path=db_path,
        )

    @classmethod
    async def from_auth_settings(
        cls,
        db_path: Path | None = None,
        http_client: Any | None = None,
    ) -> VKClient:
        settings_map = await load_vk_settings_map(VK_AUTH_SETTINGS_KEYS, db_path)
        access_token = _get_required_setting(
            settings_map,
            "vk_access_token",
            "VK access token is not configured in app_settings.",
        )
        return cls(
            access_token=access_token,
            client_id=_normalize_optional_setting(settings_map, "vk_client_id"),
            refresh_token=_normalize_optional_setting(settings_map, "vk_refresh_token"),
            device_id=_normalize_optional_setting(settings_map, "vk_device_id"),
            token_expires_at=_parse_optional_datetime(settings_map.get("vk_token_expires_at")),
            token_scope=_normalize_optional_setting(settings_map, "vk_token_scope"),
            http_client=http_client,
            db_path=db_path,
        )

    async def get_profile(self) -> VKUserProfile:
        payload = await self._http.post(
            VK_ID_USER_INFO_URL,
            data={
                "access_token": self.access_token,
                "client_id": self.client_id or "",
            },
        )
        payload.raise_for_status()
        data = payload.json()
        user = data.get("user", {})
        user_id = str(user.get("user_id") or "").strip()
        if not user_id:
            raise RuntimeError("VK auth succeeded but user profile is incomplete.")

        return VKUserProfile(
            user_id=user_id,
            first_name=_normalize_optional_value(user.get("first_name")),
            last_name=_normalize_optional_value(user.get("last_name")),
            email=_normalize_optional_value(user.get("email")),
        )

    async def list_communities(self) -> list[VKCommunity]:
        communities: dict[str, VKCommunity] = {}

        for role in ("admin", "editor"):
            response = await self._call(
                "groups.get",
                extended=1,
                filter=role,
                fields="can_post",
                count=1000,
            )
            items = response.get("items", [])
            for item in items:
                group_id = str(item.get("id") or "").strip()
                if not group_id:
                    continue

                existing = communities.get(group_id)
                current = VKCommunity(
                    group_id=group_id,
                    name=str(item.get("name") or group_id),
                    screen_name=_normalize_optional_value(item.get("screen_name")),
                    role="admin" if role == "admin" else "editor",
                    can_post=bool(item.get("can_post")),
                )
                if existing is None or existing.role != "admin":
                    communities[group_id] = current

        return sorted(
            communities.values(),
            key=lambda community: (community.name.casefold(), int(community.group_id)),
        )

    async def validate_community_access(self, group_id: str) -> VKCommunity:
        normalized_group_id = group_id.strip()
        if not normalized_group_id:
            raise ValueError("VK group ID must not be empty.")

        communities = await self.list_communities()
        for community in communities:
            if community.group_id != normalized_group_id:
                continue
            if not community.can_post:
                raise ValueError(
                    "Selected VK community does not allow wall posting for the authorized account."
                )
            return community

        raise ValueError(
            "Selected VK community is not available for the authorized VK account."
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
            owner_id=f"-{self._require_group_id()}",
            question=normalized_question,
            add_answers=json.dumps(normalized_options, ensure_ascii=False),
            is_anonymous=int(is_anonymous),
        )
        return int(result["id"])

    async def upload_photo(self, image_path: str | Path) -> str:
        resolved_image_path = Path(image_path)
        upload_server = await self._call(
            "photos.getWallUploadServer",
            group_id=self._require_group_id(),
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
            group_id=self._require_group_id(),
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
            "owner_id": f"-{self._require_group_id()}",
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
            owner_id=f"-{self._require_group_id()}",
            post_id=post_id,
        )
        return True

    async def logout(self) -> None:
        if not self.client_id or not self.access_token:
            return

        response = await self._http.post(
            VK_ID_LOGOUT_URL,
            data={
                "client_id": self.client_id,
                "access_token": self.access_token,
            },
        )
        response.raise_for_status()

    async def refresh_access_token(self) -> str:
        if not self.client_id or not self.refresh_token or not self.device_id:
            raise RuntimeError("VK refresh token metadata is incomplete. Reconnect VK in settings.")

        response = await self._http.post(
            VK_ID_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token,
                "client_id": self.client_id,
                "device_id": self.device_id,
                "state": secrets.token_urlsafe(24),
            },
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            error = payload.get("error_description") or payload["error"]
            raise RuntimeError(f"VK token refresh failed: {error}")

        self.access_token = str(payload["access_token"]).strip()
        refreshed_token = _normalize_optional_value(payload.get("refresh_token"))
        if refreshed_token:
            self.refresh_token = refreshed_token
        self.token_scope = _normalize_optional_value(payload.get("scope")) or self.token_scope
        expires_in = payload.get("expires_in")
        self.token_expires_at = _build_expiration_timestamp(expires_in)

        if self.db_path is not None:
            await upsert_vk_settings(
                {
                    "vk_access_token": self.access_token,
                    "vk_refresh_token": self.refresh_token,
                    "vk_token_scope": self.token_scope,
                    "vk_token_expires_at": _serialize_datetime(self.token_expires_at),
                },
                self.db_path,
            )

        return self.access_token

    async def close(self) -> None:
        if self._owns_client and hasattr(self._http, "aclose"):
            await self._http.aclose()
        elif hasattr(self._http, "aclose"):
            await self._http.aclose()

    async def _call(
        self,
        method: str,
        _retry_on_refresh: bool = True,
        **params: object,
    ) -> dict[str, Any]:
        if self._should_refresh_before_request():
            await self.refresh_access_token()

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
        if "error" not in payload:
            return payload["response"]

        error = payload["error"]
        if _retry_on_refresh and _is_refreshable_auth_error(error) and self._can_refresh():
            await self.refresh_access_token()
            return await self._call(method, _retry_on_refresh=False, **params)

        if _is_refreshable_auth_error(error):
            raise RuntimeError("VK token refresh failed. Reconnect VK in settings.")

        raise RuntimeError(f"VK API error: {error.get('error_msg', error)}")

    def _require_group_id(self) -> str:
        if not self.group_id:
            raise ValueError("VK group ID must be configured for publishing.")
        return self.group_id

    def _can_refresh(self) -> bool:
        return bool(self.client_id and self.refresh_token and self.device_id)

    def _should_refresh_before_request(self) -> bool:
        if not self._can_refresh() or self.token_expires_at is None:
            return False
        return self.token_expires_at <= datetime.now(timezone.utc) + timedelta(seconds=30)


def _get_required_setting(
    settings_map: dict[str, str | None],
    key: str,
    error_message: str,
) -> str:
    value = _normalize_optional_setting(settings_map, key)
    if not value:
        raise ValueError(error_message)
    return value


def _normalize_optional_setting(
    settings_map: dict[str, str | None],
    key: str,
) -> str | None:
    return _normalize_optional_value(settings_map.get(key))


def _normalize_optional_value(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _parse_optional_datetime(value: str | None) -> datetime | None:
    normalized = _normalize_optional_value(value)
    if normalized is None:
        return None
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _build_expiration_timestamp(expires_in: object) -> datetime | None:
    if expires_in in (None, "", 0, "0"):
        return None
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    if seconds <= 0:
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


def _is_refreshable_auth_error(error: dict[str, Any]) -> bool:
    return int(error.get("error_code", 0) or 0) == 5


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
