from __future__ import annotations

from datetime import datetime, timezone
from inspect import isawaitable
from pathlib import Path
from typing import Any, Callable

import aiosqlite

from app.config import get_settings
from app.core.media import MediaStorage
from app.core.posts import ValidationIssue, parse_post_file, validate_post
from app.core.preview import format_telegram, format_vk
from app.core.publishing.status_repository import StatusRepository
from app.infra import TelegramPublisher, VKClient
from app.schemas.publishing import (
    PublishRecord,
    PublishRequest,
    ScheduleUpdateRequest,
    ScheduledPost,
)

PublishClientFactory = Callable[[], Any]


class PublishValidationError(ValueError):
    def __init__(self, issues: list[ValidationIssue]):
        self.issues = issues
        codes = ", ".join(issue.code for issue in issues)
        super().__init__(f"Publish blocked by validation errors: {codes}")


class DuplicatePublishError(RuntimeError):
    pass


class ScheduleStateError(RuntimeError):
    pass


class PublishService:
    def __init__(
        self,
        repository: StatusRepository | None = None,
        media_storage: MediaStorage | None = None,
        telegram_factory: PublishClientFactory | None = None,
        vk_factory: PublishClientFactory | None = None,
    ) -> None:
        settings = get_settings()
        self.repository = repository or StatusRepository()
        self.media_storage = media_storage or MediaStorage(settings.images_dir)
        self.telegram_factory = telegram_factory or TelegramPublisher.from_settings
        self.vk_factory = vk_factory or VKClient.from_settings

    async def publish(self, file_name: str, payload: PublishRequest) -> PublishRecord:
        post_path = _resolve_post_path(file_name)
        post = parse_post_file(post_path)
        overrides = payload.model_dump(exclude_unset=True, exclude={"schedule"})
        if overrides:
            post = post.model_copy(update=overrides)

        platform = post.platform
        if not platform:
            raise ValueError("Post platform is not set.")

        validation_issues = validate_post(post, platform)
        blocking_issues = [
            issue for issue in validation_issues if issue.level == "error"
        ]
        if blocking_issues:
            await self.repository.log_attempt(
                post.file_name,
                "publish",
                payload.model_dump(),
                {
                    "status": "validation_error",
                    "issues": [issue.model_dump() for issue in blocking_issues],
                },
            )
            raise PublishValidationError(blocking_issues)

        if payload.schedule and (not post.date or not post.time):
            await self.repository.log_attempt(
                post.file_name,
                "publish",
                payload.model_dump(),
                {
                    "status": "failure",
                    "error": "Scheduled publish requires date and time.",
                },
            )
            raise ValueError("Scheduled publish requires date and time.")

        existing = await self.repository.find(post.file_name, platform)
        if any(record.status in {"scheduled", "published"} for record in existing):
            error_message = (
                f"Post {post.file_name} is already tracked as scheduled/published "
                f"for {platform}."
            )
            await self.repository.log_attempt(
                post.file_name,
                "publish",
                payload.model_dump(),
                {
                    "status": "duplicate",
                    "error": error_message,
                },
            )
            raise DuplicatePublishError(error_message)

        record_id = await self._reserve_publish_record(post, payload.schedule)
        try:
            record = await self._publish_to_platform(post, schedule=payload.schedule)
        except Exception as exc:
            failure_message = _describe_publish_error(exc)
            await self.repository.update_status(
                record_id,
                "failed",
                error=failure_message,
            )
            await self.repository.log_attempt(
                post.file_name,
                "publish",
                payload.model_dump(),
                {
                    "status": "failure",
                    "error": failure_message,
                    "record_id": record_id,
                },
            )
            raise RuntimeError(failure_message) from exc

        await self.repository.update_status(
            record_id,
            record.status,
            message_id=record.message_id,
            poll_message_id=record.poll_message_id,
            published_at=record.published_at,
            error="",
        )
        stored_record = await self.repository.get(record_id)
        if stored_record is None:
            raise RuntimeError(
                f"Publish record {record_id} could not be reloaded after publish."
            )
        await self.repository.log_attempt(
            post.file_name,
            "publish",
            payload.model_dump(),
            {
                "status": stored_record.status,
                "record_id": record_id,
                "message_id": stored_record.message_id,
                "poll_message_id": stored_record.poll_message_id,
            },
        )
        return stored_record

    async def list_schedules(self) -> list[ScheduledPost]:
        records = await self.repository.list(status="scheduled")
        items: list[ScheduledPost] = []
        for record in records:
            if record.id is None or not record.scheduled_date or not record.scheduled_time:
                continue
            items.append(
                ScheduledPost(
                    id=record.id,
                    file_name=record.file_name,
                    platform=record.platform,
                    scheduled_date=record.scheduled_date,
                    scheduled_time=record.scheduled_time,
                    status=record.status,
                )
            )
        return items

    async def cancel_schedule(self, record_id: int) -> PublishRecord:
        record = await self._require_scheduled_record(record_id)

        try:
            await self._cancel_platform_record(record)
        except Exception as exc:
            failure_message = _describe_publish_error(exc)
            await self.repository.update_status(
                record_id,
                "failed",
                error=failure_message,
            )
            await self.repository.log_attempt(
                record.file_name,
                "cancel",
                {"record_id": record_id},
                {
                    "status": "failure",
                    "error": failure_message,
                },
            )
            raise RuntimeError(failure_message) from exc

        await self.repository.update_status(
            record_id,
            "cancelled",
            error="",
        )
        await self.repository.log_attempt(
            record.file_name,
            "cancel",
            {"record_id": record_id},
            {
                "status": "cancelled",
            },
        )
        cancelled_record = await self.repository.get(record_id)
        if cancelled_record is None:
            raise RuntimeError(f"Cancelled record {record_id} could not be reloaded.")
        return cancelled_record

    async def reschedule(
        self,
        record_id: int,
        payload: ScheduleUpdateRequest,
    ) -> PublishRecord:
        record = await self._require_scheduled_record(record_id)
        post_path = _resolve_post_path(record.file_name)
        post = parse_post_file(post_path).model_copy(
            update={
                "platform": record.platform,
                "date": payload.scheduled_date,
                "time": payload.scheduled_time,
            }
        )

        blocking_issues = [
            issue
            for issue in validate_post(post, record.platform)
            if issue.level == "error"
        ]
        if blocking_issues:
            await self.repository.log_attempt(
                record.file_name,
                "reschedule",
                payload.model_dump(),
                {
                    "status": "validation_error",
                    "issues": [issue.model_dump() for issue in blocking_issues],
                },
            )
            raise PublishValidationError(blocking_issues)

        try:
            await self._cancel_platform_record(record)
        except Exception as exc:
            failure_message = _describe_publish_error(exc)
            await self.repository.update_status(
                record_id,
                "failed",
                error=failure_message,
            )
            await self.repository.log_attempt(
                record.file_name,
                "reschedule",
                payload.model_dump(),
                {
                    "status": "failure",
                    "error": failure_message,
                },
            )
            raise RuntimeError(failure_message) from exc

        try:
            refreshed_record = await self._publish_to_platform(post, schedule=True)
        except Exception as exc:
            failure_message = _describe_publish_error(exc)
            await self.repository.update_status(
                record_id,
                "failed",
                error=failure_message,
            )
            await self.repository.log_attempt(
                record.file_name,
                "reschedule",
                payload.model_dump(),
                {
                    "status": "failure",
                    "error": failure_message,
                },
            )
            raise RuntimeError(failure_message) from exc

        if refreshed_record.message_id is None:
            raise RuntimeError("Rescheduled publish did not return a message id.")

        await self.repository.update_schedule(
            record_id,
            scheduled_date=payload.scheduled_date,
            scheduled_time=payload.scheduled_time,
            message_id=refreshed_record.message_id,
            poll_message_id=refreshed_record.poll_message_id,
            error="",
        )
        await self.repository.log_attempt(
            record.file_name,
            "reschedule",
            payload.model_dump(),
            {
                "status": "scheduled",
                "message_id": refreshed_record.message_id,
                "poll_message_id": refreshed_record.poll_message_id,
            },
        )
        updated_record = await self.repository.get(record_id)
        if updated_record is None:
            raise RuntimeError(f"Rescheduled record {record_id} could not be reloaded.")
        return updated_record

    async def _publish_to_platform(
        self,
        post: Any,
        schedule: bool,
    ) -> PublishRecord:
        image_path = await self.media_storage.get_path(post.file_name)
        schedule_date = post.date if schedule else None
        schedule_time = post.time if schedule else None

        if post.platform == "telegram":
            rendered_text = format_telegram(post)
            client = await _resolve_client(self.telegram_factory)
            try:
                message_id = await client.send_message(
                    rendered_text,
                    image_path=image_path,
                    schedule_date=schedule_date,
                    schedule_time=schedule_time,
                )
                poll_message_id = None
                if post.poll:
                    poll_message_id = await client.send_poll(
                        post.poll.question,
                        post.poll.options,
                        schedule_date=schedule_date,
                        schedule_time=schedule_time,
                    )
            finally:
                await _close_client(client, "disconnect")
        elif post.platform == "vk":
            rendered_text = format_vk(post)
            client = await _resolve_client(self.vk_factory)
            try:
                attachments: list[str] = []
                if image_path is not None:
                    attachments.append(await client.upload_photo(image_path))
                if post.poll:
                    poll_id = await client.create_poll(
                        post.poll.question,
                        post.poll.options,
                    )
                    attachments.append(f"poll-{client.group_id}_{poll_id}")

                message_id = await client.wall_post(
                    rendered_text,
                    attachments=attachments or None,
                    publish_date=schedule_date,
                    publish_time=schedule_time,
                )
                poll_message_id = None
            finally:
                await _close_client(client, "close")
        else:
            raise ValueError(f"Unsupported platform: {post.platform}")

        return PublishRecord(
            file_name=post.file_name,
            platform=post.platform,
            scheduled_date=schedule_date,
            scheduled_time=schedule_time,
            message_id=message_id,
            poll_message_id=poll_message_id,
            status="scheduled" if schedule else "published",
            published_at=None if schedule else datetime.now(timezone.utc).isoformat(),
            error=None,
        )

    async def _require_scheduled_record(self, record_id: int) -> PublishRecord:
        record = await self.repository.get(record_id)
        if record is None:
            raise FileNotFoundError(f"Schedule record not found: {record_id}")
        if record.status != "scheduled":
            raise ScheduleStateError(
                f"Record {record_id} is not scheduled (status={record.status})."
            )
        return record

    async def _cancel_platform_record(self, record: PublishRecord) -> None:
        if record.platform == "telegram":
            client = await _resolve_client(self.telegram_factory)
            try:
                if record.message_id is not None:
                    deleted = await client.delete_message(record.message_id)
                    if not deleted:
                        raise RuntimeError(
                            f"Telegram message {record.message_id} could not be deleted."
                        )
                if record.poll_message_id is not None:
                    deleted = await client.delete_message(record.poll_message_id)
                    if not deleted:
                        raise RuntimeError(
                            f"Telegram poll {record.poll_message_id} could not be deleted."
                        )
            finally:
                await _close_client(client, "disconnect")
            return

        if record.platform == "vk":
            client = await _resolve_client(self.vk_factory)
            try:
                if record.message_id is not None:
                    deleted = await client.delete_post(record.message_id)
                    if not deleted:
                        raise RuntimeError(
                            f"VK post {record.message_id} could not be deleted."
                        )
            finally:
                await _close_client(client, "close")
            return

        raise ValueError(f"Unsupported platform: {record.platform}")

    async def _reserve_publish_record(
        self,
        post: Any,
        schedule: bool,
    ) -> int:
        reserved_record = PublishRecord(
            file_name=post.file_name,
            platform=post.platform,
            scheduled_date=post.date if schedule else None,
            scheduled_time=post.time if schedule else None,
            status="scheduled" if schedule else "published",
        )

        try:
            return await self.repository.add(reserved_record)
        except aiosqlite.IntegrityError as exc:
            error_message = (
                f"Post {post.file_name} is already tracked as scheduled/published "
                f"for {post.platform}."
            )
            await self.repository.log_attempt(
                post.file_name,
                "publish",
                {
                    "schedule": schedule,
                    "platform": post.platform,
                    "date": post.date,
                    "time": post.time,
                },
                {
                    "status": "duplicate",
                    "error": error_message,
                },
            )
            raise DuplicatePublishError(error_message) from exc


def _resolve_post_path(file_name: str) -> Path:
    if Path(file_name).name != file_name or not file_name.endswith(".md"):
        raise ValueError("Invalid post filename.")

    post_path = get_settings().posts_dir / file_name
    if not post_path.exists():
        raise FileNotFoundError(f"Post not found: {file_name}")
    return post_path


async def _resolve_client(factory: PublishClientFactory) -> Any:
    client = factory()
    if isawaitable(client):
        return await client
    return client


async def _close_client(client: Any, method_name: str) -> None:
    if not hasattr(client, method_name):
        return

    result = getattr(client, method_name)()
    if isawaitable(result):
        await result


def _describe_publish_error(exc: Exception) -> str:
    if isinstance(exc, (DuplicatePublishError, ScheduleStateError, ValueError)):
        return str(exc)
    if isinstance(exc, FileNotFoundError):
        return "Required post or media asset was not found."
    if isinstance(exc, TimeoutError):
        return "Platform request timed out."

    message = " ".join(str(exc).split())
    if not message or "traceback" in message.lower():
        return "Platform request failed."
    return message
