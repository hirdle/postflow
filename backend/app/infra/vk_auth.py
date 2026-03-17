from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx

from app.infra.vk_client import (
    VK_API_VERSION,
    VKClient,
    VKCommunity,
    VK_OAUTH_AUTHORIZE_BASE,
    VK_OAUTH_TOKEN_URL,
    VK_OPTIONAL_SCOPES,
    VK_REQUIRED_SCOPES,
    delete_vk_settings,
    load_vk_settings_map,
    upsert_vk_settings,
)

VK_ALLOWED_REDIRECT_URIS = {
    "http://localhost:3000/settings/vk/callback",
    "http://127.0.0.1:3000/settings/vk/callback",
}
VK_AUTH_SESSION_TTL = timedelta(minutes=15)


class _Unset:
    pass


_UNSET = _Unset()


@dataclass(frozen=True, slots=True)
class VkAuthSnapshot:
    session_id: str
    status: str
    started_at: datetime
    expires_at: datetime | None
    authorize_url: str | None
    error: str | None
    account_label: str | None
    communities: list[VKCommunity]


@dataclass(slots=True)
class VkAuthFlow:
    session_id: str
    status: str
    started_at: datetime
    expires_at: datetime | None
    authorize_url: str | None
    error: str | None
    account_label: str | None
    communities: list[VKCommunity]
    client_id: str
    redirect_uri: str
    state: str

    def snapshot(self) -> VkAuthSnapshot:
        return VkAuthSnapshot(
            session_id=self.session_id,
            status=self.status,
            started_at=self.started_at,
            expires_at=self.expires_at,
            authorize_url=self.authorize_url,
            error=self.error,
            account_label=self.account_label,
            communities=list(self.communities),
        )


class VkAuthManager:
    def __init__(self, http_client: Any | None = None) -> None:
        self._lock = asyncio.Lock()
        self._flows: dict[str, VkAuthFlow] = {}
        self._http = http_client or httpx.AsyncClient(timeout=30)
        self._owns_client = http_client is None

    async def start(
        self,
        redirect_uri: str,
    ) -> VkAuthSnapshot:
        normalized_redirect_uri = _normalize_redirect_uri(redirect_uri)
        client_id, _ = await _load_vk_app_credentials()
        await self._clear_flows()

        session_id = uuid4().hex
        state = _generate_state(session_id)
        flow = VkAuthFlow(
            session_id=session_id,
            status="waiting_for_callback",
            started_at=_utcnow(),
            expires_at=_utcnow() + VK_AUTH_SESSION_TTL,
            authorize_url=_build_authorize_url(
                client_id=client_id,
                redirect_uri=normalized_redirect_uri,
                state=state,
            ),
            error=None,
            account_label=None,
            communities=[],
            client_id=client_id,
            redirect_uri=normalized_redirect_uri,
            state=state,
        )
        await self._replace_flow(flow)
        return flow.snapshot()

    async def get(self, session_id: str) -> VkAuthSnapshot:
        expired_snapshot = await self._expire_if_needed(session_id)
        if expired_snapshot is not None:
            return expired_snapshot

        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)
            return flow.snapshot()

    async def exchange(
        self,
        session_id: str,
        payload: dict[str, str | None],
    ) -> VkAuthSnapshot:
        expired_snapshot = await self._expire_if_needed(session_id)
        if expired_snapshot is not None:
            raise RuntimeError("VK authorization session expired. Start a new session.")

        normalized_payload = _normalize_exchange_payload(payload)
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)
            if flow.status == "authorizing":
                raise RuntimeError("VK authorization session is already being finalized.")
            if flow.status in {"authorized", "cancelled", "failed", "expired"}:
                raise RuntimeError("VK authorization session is already finalized.")

            if normalized_payload.get("error"):
                message = normalized_payload.get("error_description") or normalized_payload["error"]
                flow.status = "failed"
                flow.error = message
                flow.authorize_url = None
                flow.expires_at = None
                raise RuntimeError(message)

            if normalized_payload.get("state") != flow.state:
                message = "VK auth state mismatch. Start the authorization again."
                flow.status = "failed"
                flow.error = message
                flow.authorize_url = None
                flow.expires_at = None
                raise ValueError(message)

            flow.status = "authorizing"
            flow.error = None
            client_id = flow.client_id
            redirect_uri = flow.redirect_uri

        access_token = normalized_payload.get("access_token")
        token_expires_at = _build_expiration_timestamp(normalized_payload.get("expires_in"))
        token_scope = _normalize_optional_value(normalized_payload.get("scope"))

        if normalized_payload.get("code"):
            try:
                _, client_secret = await _load_vk_app_credentials()
                token_payload = await self._exchange_code(
                    client_id=client_id,
                    client_secret=client_secret,
                    redirect_uri=redirect_uri,
                    code=str(normalized_payload["code"]),
                )
            except Exception as exc:
                message = str(exc)
                await self._finalize_flow(session_id, status="failed", error=message)
                raise RuntimeError(message) from exc

            access_token = _normalize_optional_value(token_payload.get("access_token"))
            token_expires_at = _build_expiration_timestamp(token_payload.get("expires_in"))
            token_scope = _normalize_optional_value(token_payload.get("scope"))

        if not access_token:
            message = "VK callback payload does not contain an access token."
            await self._finalize_flow(session_id, status="failed", error=message)
            raise ValueError(message)

        user_client = VKClient(
            access_token=access_token,
            client_id=client_id,
            token_expires_at=token_expires_at,
            token_scope=token_scope,
            http_client=self._http,
        )
        try:
            scope = await user_client.ensure_required_permissions()
            profile = await user_client.get_profile()
            communities = await user_client.list_communities()

            await _persist_vk_auth_result(
                access_token=access_token,
                refresh_token=None,
                device_id=None,
                scope=scope,
                expires_at=user_client.token_expires_at,
                user_id=profile.user_id,
                account_label=profile.account_label,
                communities=communities,
            )
        except Exception as exc:
            message = str(exc)
            await self._finalize_flow(session_id, status="failed", error=message)
            raise RuntimeError(message) from exc

        return await self._finalize_flow(
            session_id,
            status="authorized",
            error=None,
            account_label=profile.account_label,
            communities=communities,
        )

    async def cancel(self, session_id: str) -> VkAuthSnapshot:
        return await self._finalize_flow(
            session_id,
            status="cancelled",
            error=None,
            clear_authorize_url=True,
        )

    async def shutdown(self) -> None:
        async with self._lock:
            self._flows.clear()

        if self._owns_client and hasattr(self._http, "aclose"):
            await self._http.aclose()
        elif hasattr(self._http, "aclose"):
            await self._http.aclose()

    async def _exchange_code(
        self,
        *,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        code: str,
    ) -> dict[str, Any]:
        response = await self._http.get(
            VK_OAUTH_TOKEN_URL,
            params={
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
        payload = _try_parse_response_json(response)
        if response.status_code >= 400:
            detail = _extract_vk_oauth_error(payload) or _extract_response_text(response)
            raise RuntimeError(
                f"VK token exchange failed ({response.status_code}): {detail or 'unknown error'}"
            )
        if payload.get("error"):
            error = payload.get("error_description") or payload["error"]
            raise RuntimeError(f"VK token exchange failed: {error}")
        return payload

    async def _replace_flow(self, flow: VkAuthFlow) -> None:
        async with self._lock:
            self._flows = {flow.session_id: flow}

    async def _clear_flows(self) -> None:
        async with self._lock:
            self._flows.clear()

    async def _patch_flow(
        self,
        session_id: str,
        *,
        status: str | None = None,
        error: str | None | object = _UNSET,
    ) -> None:
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)
            if status is not None:
                flow.status = status
            if error is not _UNSET:
                flow.error = error if isinstance(error, str) or error is None else flow.error

    async def _finalize_flow(
        self,
        session_id: str,
        *,
        status: str,
        error: str | None,
        account_label: str | None = None,
        communities: list[VKCommunity] | None = None,
        clear_authorize_url: bool = True,
    ) -> VkAuthSnapshot:
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)

            flow.status = status
            flow.error = error
            flow.account_label = account_label
            flow.communities = list(communities or flow.communities)
            if clear_authorize_url:
                flow.authorize_url = None
            if status in {"authorized", "cancelled", "failed", "expired"}:
                flow.expires_at = None

            return flow.snapshot()

    async def _expire_if_needed(self, session_id: str) -> VkAuthSnapshot | None:
        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)
            if flow.expires_at is None:
                return None
            if flow.expires_at > _utcnow():
                return None

        return await self._finalize_flow(
            session_id,
            status="expired",
            error="VK authorization session expired. Start a new session.",
        )


@lru_cache(maxsize=1)
def get_vk_auth_manager() -> VkAuthManager:
    return VkAuthManager()


def _normalize_redirect_uri(redirect_uri: str) -> str:
    normalized = redirect_uri.strip()
    if normalized not in VK_ALLOWED_REDIRECT_URIS:
        raise ValueError(
            "VK redirect URI must be one of the configured localhost callback URLs."
        )
    return normalized


async def _load_vk_app_credentials() -> tuple[str, str]:
    settings_map = await load_vk_settings_map(("vk_client_id", "vk_client_secret"))
    client_id = _normalize_optional_value(settings_map.get("vk_client_id"))
    if client_id is None:
        raise ValueError("VK client ID is not configured in app_settings.")
    client_secret = _normalize_optional_value(settings_map.get("vk_client_secret"))
    if client_secret is None:
        raise ValueError("VK client secret is not configured in app_settings.")
    return client_id, client_secret


async def _persist_vk_auth_result(
    *,
    access_token: str,
    refresh_token: str | None,
    device_id: str | None,
    scope: str | None,
    expires_at: datetime | None,
    user_id: str,
    account_label: str,
    communities: list[VKCommunity],
) -> None:
    current = await load_vk_settings_map(("vk_group_id", "vk_group_name"))
    current_group_id = _normalize_optional_value(current.get("vk_group_id"))
    selected_group = None
    if current_group_id:
        selected_group = next(
            (community for community in communities if community.group_id == current_group_id and community.can_post),
            None,
        )

    updates = {
        "vk_access_token": access_token,
        "vk_refresh_token": refresh_token,
        "vk_device_id": device_id,
        "vk_token_scope": scope,
        "vk_token_expires_at": _serialize_datetime(expires_at),
        "vk_user_id": user_id,
        "vk_account_label": account_label,
    }
    if selected_group is not None:
        updates["vk_group_id"] = selected_group.group_id
        updates["vk_group_name"] = selected_group.name

    await upsert_vk_settings(updates)
    if selected_group is None and current_group_id is not None:
        await delete_vk_settings(("vk_group_id", "vk_group_name"))


def _build_authorize_url(
    *,
    client_id: str,
    redirect_uri: str,
    state: str,
) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "display": "page",
            "scope": ",".join(sorted(VK_REQUIRED_SCOPES | VK_OPTIONAL_SCOPES)),
            "redirect_uri": redirect_uri,
            "state": state,
            "revoke": 1,
            "v": VK_API_VERSION,
        }
    )
    return f"{VK_OAUTH_AUTHORIZE_BASE}?{query}"


def _generate_state(session_id: str) -> str:
    return f"{session_id}.{uuid4().hex}{uuid4().hex}"


def _normalize_exchange_payload(payload: dict[str, str | None]) -> dict[str, str | None]:
    raw_payload = _normalize_optional_value(payload.get("payload"))
    normalized = {
        "code": _normalize_optional_value(payload.get("code")),
        "access_token": _normalize_optional_value(payload.get("access_token")),
        "expires_in": _normalize_optional_value(payload.get("expires_in")),
        "state": _normalize_optional_value(payload.get("state")),
        "user_id": _normalize_optional_value(payload.get("user_id")),
        "scope": _normalize_optional_value(payload.get("scope")),
        "error": _normalize_optional_value(payload.get("error")),
        "error_description": _normalize_optional_value(payload.get("error_description")),
    }
    if raw_payload is None:
        return normalized

    try:
        parsed = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        raise ValueError("VK callback payload is not valid JSON.") from exc

    for key in normalized:
        value = _normalize_optional_value(parsed.get(key))
        if value is not None:
            normalized[key] = value

    return normalized


def _build_expiration_timestamp(expires_in: object) -> datetime | None:
    if expires_in in (None, "", 0, "0"):
        return None
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    if seconds <= 0:
        return None
    return _utcnow() + timedelta(seconds=seconds)


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _normalize_optional_value(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _try_parse_response_json(response: Any) -> dict[str, Any]:
    try:
        payload = response.json()
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _extract_vk_oauth_error(payload: dict[str, Any]) -> str | None:
    error = _normalize_optional_value(payload.get("error"))
    description = _normalize_optional_value(payload.get("error_description"))
    if error and description:
        return f"{error}: {description}"
    return error or description


def _extract_response_text(response: Any) -> str | None:
    raw_text = getattr(response, "text", None)
    normalized = _normalize_optional_value(raw_text)
    if normalized is not None:
        return normalized
    if hasattr(response, "read"):
        try:
            return _normalize_optional_value(response.read())
        except Exception:
            return None
    return None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
