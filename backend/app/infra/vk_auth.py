from __future__ import annotations

import asyncio
import base64
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx

from app.infra.vk_client import (
    VKClient,
    VKCommunity,
    VK_ID_AUTHORIZE_BASE,
    VK_ID_TOKEN_URL,
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
    code_verifier: str

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
        client_id = await _load_vk_client_id()
        await self._clear_flows()

        code_verifier = _generate_code_verifier()
        state = _generate_state()
        flow = VkAuthFlow(
            session_id=uuid4().hex,
            status="waiting_for_callback",
            started_at=_utcnow(),
            expires_at=_utcnow() + VK_AUTH_SESSION_TTL,
            authorize_url=_build_authorize_url(
                client_id=client_id,
                redirect_uri=normalized_redirect_uri,
                state=state,
                code_challenge=_build_code_challenge(code_verifier),
            ),
            error=None,
            account_label=None,
            communities=[],
            client_id=client_id,
            redirect_uri=normalized_redirect_uri,
            state=state,
            code_verifier=code_verifier,
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

        async with self._lock:
            flow = self._flows.get(session_id)
            if flow is None:
                raise KeyError(session_id)
            if flow.status in {"authorized", "cancelled"}:
                raise RuntimeError("VK authorization session is already finalized.")

        normalized_payload = _normalize_exchange_payload(payload)
        if normalized_payload.get("error"):
            message = normalized_payload.get("error_description") or normalized_payload["error"]
            await self._finalize_flow(session_id, status="failed", error=message)
            raise RuntimeError(message)

        if normalized_payload.get("state") != flow.state:
            await self._finalize_flow(
                session_id,
                status="failed",
                error="VK auth state mismatch. Start the authorization again.",
            )
            raise ValueError("VK auth state mismatch. Start the authorization again.")

        code = normalized_payload.get("code")
        device_id = normalized_payload.get("device_id")
        if not code:
            raise ValueError("VK callback payload does not contain an authorization code.")
        if not device_id:
            raise ValueError("VK callback payload does not contain a device_id.")

        await self._patch_flow(session_id, status="authorizing", error=None)

        try:
            token_payload = await self._exchange_code(
                flow=flow,
                code=code,
                device_id=device_id,
            )
        except Exception as exc:
            message = str(exc)
            await self._finalize_flow(session_id, status="failed", error=message)
            raise RuntimeError(message) from exc
        scope = _normalize_optional_value(token_payload.get("scope"))
        missing_scopes = _missing_required_scopes(scope)
        if missing_scopes:
            message = (
                "VK token is missing required scopes: "
                + ", ".join(sorted(missing_scopes))
                + "."
            )
            await self._finalize_flow(session_id, status="failed", error=message)
            raise RuntimeError(message)

        access_token = _get_required_payload_value(token_payload, "access_token")
        refresh_token = _normalize_optional_value(token_payload.get("refresh_token"))
        user_client = VKClient(
            access_token=access_token,
            client_id=flow.client_id,
            refresh_token=refresh_token,
            device_id=device_id,
            token_expires_at=_build_expiration_timestamp(token_payload.get("expires_in")),
            token_scope=scope,
            http_client=self._http,
        )
        try:
            profile = await user_client.get_profile()
            communities = await user_client.list_communities()

            await _persist_vk_auth_result(
                access_token=access_token,
                refresh_token=refresh_token,
                device_id=device_id,
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
        flow: VkAuthFlow,
        code: str,
        device_id: str,
    ) -> dict[str, Any]:
        response = await self._http.post(
            VK_ID_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": flow.code_verifier,
                "client_id": flow.client_id,
                "device_id": device_id,
                "redirect_uri": flow.redirect_uri,
                "state": flow.state,
            },
        )
        response.raise_for_status()
        payload = response.json()
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


async def _load_vk_client_id() -> str:
    settings_map = await load_vk_settings_map(("vk_client_id",))
    client_id = _normalize_optional_value(settings_map.get("vk_client_id"))
    if client_id is None:
        raise ValueError("VK client ID is not configured in app_settings.")
    return client_id


async def _persist_vk_auth_result(
    *,
    access_token: str,
    refresh_token: str | None,
    device_id: str,
    scope: str | None,
    expires_at: datetime | None,
    user_id: str,
    account_label: str,
    communities: list[VKCommunity],
) -> None:
    current = await load_vk_settings_map(("vk_group_id", "vk_group_name"))
    current_group_id = _normalize_optional_value(current.get("vk_group_id"))
    current_group_name = _normalize_optional_value(current.get("vk_group_name"))
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
    code_challenge: str,
) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "scope": " ".join(sorted(VK_REQUIRED_SCOPES | VK_OPTIONAL_SCOPES)),
            "redirect_uri": redirect_uri,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{VK_ID_AUTHORIZE_BASE}?{query}"


def _generate_code_verifier() -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(uuid4().hex.encode("utf-8")).digest()).decode("utf-8").rstrip("=")


def _generate_state() -> str:
    return uuid4().hex + uuid4().hex


def _build_code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _normalize_exchange_payload(payload: dict[str, str | None]) -> dict[str, str | None]:
    raw_payload = _normalize_optional_value(payload.get("payload"))
    normalized = {
        "code": _normalize_optional_value(payload.get("code")),
        "state": _normalize_optional_value(payload.get("state")),
        "device_id": _normalize_optional_value(payload.get("device_id")),
        "type": _normalize_optional_value(payload.get("type")),
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


def _missing_required_scopes(scope: str | None) -> set[str]:
    granted = _parse_scope(scope)
    return set(VK_REQUIRED_SCOPES.difference(granted))


def _parse_scope(scope: str | None) -> set[str]:
    normalized = _normalize_optional_value(scope)
    if normalized is None:
        return set()
    replaced = normalized.replace(",", " ")
    return {part.strip() for part in replaced.split() if part.strip()}


def _get_required_payload_value(payload: dict[str, Any], key: str) -> str:
    value = _normalize_optional_value(payload.get(key))
    if value is None:
        raise RuntimeError(f"VK token exchange response does not contain `{key}`.")
    return value


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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
