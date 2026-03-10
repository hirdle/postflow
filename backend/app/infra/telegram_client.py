from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from telethon import TelegramClient
from telethon.tl.functions.messages import DeleteScheduledMessagesRequest
from telethon.tl.types import InputMediaPoll, Poll, PollAnswer, TextWithEntities

from app.config import get_settings
from app.infra.database import get_db

TELEGRAM_SETTINGS_KEYS = (
    "telegram_api_id",
    "telegram_api_hash",
    "telegram_session_path",
    "telegram_channel",
)
DEFAULT_TELEGRAM_SESSION_PATH = "data/biovolt"
MSK = timezone(timedelta(hours=3))


@dataclass(frozen=True, slots=True)
class TelegramSettings:
    api_id: int
    api_hash: str
    session_path: Path
    channel: str


async def load_telegram_settings(db_path: Path | None = None) -> TelegramSettings:
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?)",
            TELEGRAM_SETTINGS_KEYS,
        )
        rows = await cursor.fetchall()

    settings_map = {key: None for key in TELEGRAM_SETTINGS_KEYS}
    settings_map.update({row["key"]: row["value"] for row in rows})

    api_id_raw = (settings_map["telegram_api_id"] or "").strip()
    api_hash = (settings_map["telegram_api_hash"] or "").strip()
    channel = (settings_map["telegram_channel"] or "").strip()
    session_path = _resolve_session_path(settings_map["telegram_session_path"])

    if not api_id_raw:
        raise ValueError("Telegram API ID is not configured in app_settings.")
    if not api_hash:
        raise ValueError("Telegram API hash is not configured in app_settings.")
    if not channel:
        raise ValueError("Telegram channel is not configured in app_settings.")

    try:
        api_id = int(api_id_raw)
    except ValueError as exc:
        raise ValueError("Telegram API ID must be an integer.") from exc

    return TelegramSettings(
        api_id=api_id,
        api_hash=api_hash,
        session_path=session_path,
        channel=channel,
    )


class TelegramPublisher:
    def __init__(
        self,
        api_id: int,
        api_hash: str,
        session_path: Path | str,
        channel: str,
        client: Any | None = None,
    ) -> None:
        normalized_api_hash = api_hash.strip()
        normalized_channel = channel.strip()
        resolved_session_path = _resolve_session_path(session_path)

        if not normalized_api_hash:
            raise ValueError("api_hash must not be empty.")
        if not normalized_channel:
            raise ValueError("channel must not be empty.")

        resolved_session_path.parent.mkdir(parents=True, exist_ok=True)

        self.api_id = int(api_id)
        self.api_hash = normalized_api_hash
        self.session_path = resolved_session_path
        self.channel = normalized_channel
        self._client = client or TelegramClient(
            str(self.session_path),
            self.api_id,
            self.api_hash,
            system_version="4.16.30-vxCUSTOM",
        )
        self._connected = False
        self._owns_client = client is None

    @classmethod
    async def from_settings(
        cls,
        db_path: Path | None = None,
        client: Any | None = None,
    ) -> TelegramPublisher:
        settings = await load_telegram_settings(db_path)
        return cls(
            api_id=settings.api_id,
            api_hash=settings.api_hash,
            session_path=settings.session_path,
            channel=settings.channel,
            client=client,
        )

    async def connect(self) -> None:
        if self._connected:
            return

        await self._client.connect()
        if not await self._client.is_user_authorized():
            raise RuntimeError(
                "Telethon session is not authorized. Run "
                "`python -m app.infra.telegram_auth_setup` first."
            )

        self._connected = True

    async def send_message(
        self,
        text: str,
        image_path: str | Path | None = None,
        schedule_date: str | None = None,
        schedule_time: str | None = None,
    ) -> int:
        await self.connect()

        message_text = text.strip()
        if not message_text and image_path is None:
            raise ValueError("text must not be empty when no image is attached.")

        schedule = _build_schedule(schedule_date, schedule_time)

        if image_path is not None:
            message = await self._client.send_file(
                self.channel,
                str(image_path),
                caption=message_text,
                parse_mode="html",
                schedule=schedule,
            )
        else:
            message = await self._client.send_message(
                self.channel,
                message_text,
                parse_mode="html",
                schedule=schedule,
            )

        return int(message.id)

    async def send_poll(
        self,
        question: str,
        options: list[str],
        schedule_date: str | None = None,
        schedule_time: str | None = None,
    ) -> int:
        await self.connect()

        normalized_question = question.strip()
        normalized_options = [option.strip() for option in options if option.strip()]
        if not normalized_question:
            raise ValueError("question must not be empty.")
        if not 2 <= len(normalized_options) <= 10:
            raise ValueError("Poll options must contain between 2 and 10 items.")

        schedule = _build_schedule(schedule_date, schedule_time)
        poll = Poll(
            id=0,
            question=TextWithEntities(text=normalized_question, entities=[]),
            answers=[
                PollAnswer(
                    text=TextWithEntities(text=option, entities=[]),
                    option=bytes([index]),
                )
                for index, option in enumerate(normalized_options)
            ],
        )
        message = await self._client.send_message(
            self.channel,
            file=InputMediaPoll(poll=poll),
            schedule=schedule,
        )
        return int(message.id)

    async def delete_message(self, message_id: int) -> bool:
        await self.connect()

        try:
            await self._client(
                DeleteScheduledMessagesRequest(
                    peer=self.channel,
                    id=[message_id],
                )
            )
            return True
        except Exception:
            try:
                await self._client.delete_messages(self.channel, [message_id])
                return True
            except Exception:
                return False

    async def disconnect(self) -> None:
        if not self._connected:
            return

        if self._owns_client and hasattr(self._client, "disconnect"):
            await self._client.disconnect()
        elif hasattr(self._client, "disconnect"):
            await self._client.disconnect()

        self._connected = False


def _resolve_session_path(value: str | Path | None) -> Path:
    settings = get_settings()
    if isinstance(value, Path):
        raw_path = value
    else:
        normalized = (value or "").strip() or DEFAULT_TELEGRAM_SESSION_PATH
        raw_path = Path(normalized)

    if raw_path.is_absolute():
        return raw_path

    return settings.project_root / raw_path


def _build_schedule(
    schedule_date: str | None,
    schedule_time: str | None,
) -> datetime | None:
    if not schedule_date and not schedule_time:
        return None
    if not schedule_date or not schedule_time:
        raise ValueError("schedule_date and schedule_time must be provided together.")

    scheduled_at = datetime.strptime(
        f"{schedule_date} {schedule_time}",
        "%Y-%m-%d %H:%M",
    )
    return scheduled_at.replace(tzinfo=MSK).astimezone(timezone.utc)
