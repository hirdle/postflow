from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.infra.database import get_db
from app.schemas.publishing import PublishAttempt, PublishRecord


class StatusRepository:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path

    async def add(self, record: PublishRecord) -> int:
        query = """
            INSERT INTO publish_records (
                file_name,
                platform,
                scheduled_date,
                scheduled_time,
                message_id,
                poll_message_id,
                status,
                published_at,
                error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            record.file_name,
            record.platform,
            record.scheduled_date,
            record.scheduled_time,
            record.message_id,
            record.poll_message_id,
            record.status,
            record.published_at,
            record.error,
        )

        async with get_db(self.db_path) as db:
            cursor = await db.execute(query, params)
            await db.commit()
            return int(cursor.lastrowid)

    async def list(
        self,
        platform: str | None = None,
        status: str | None = None,
        date: str | None = None,
    ) -> list[PublishRecord]:
        query = "SELECT * FROM publish_records"
        where, params = _build_where_clause(
            ("platform", platform),
            ("status", status),
            ("scheduled_date", date),
        )
        query = f"{query}{where} ORDER BY created_at DESC, id DESC"

        async with get_db(self.db_path) as db:
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()

        return [_row_to_record(row) for row in rows]

    async def find(
        self,
        file_name: str,
        platform: str | None = None,
    ) -> list[PublishRecord]:
        query = "SELECT * FROM publish_records"
        where, params = _build_where_clause(
            ("file_name", file_name),
            ("platform", platform),
        )
        query = f"{query}{where} ORDER BY created_at DESC, id DESC"

        async with get_db(self.db_path) as db:
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()

        return [_row_to_record(row) for row in rows]

    async def get(self, record_id: int) -> PublishRecord | None:
        async with get_db(self.db_path) as db:
            cursor = await db.execute(
                "SELECT * FROM publish_records WHERE id = ?",
                (record_id,),
            )
            row = await cursor.fetchone()

        return _row_to_record(row) if row else None

    async def update_status(
        self,
        record_id: int,
        status: str,
        message_id: int | None = None,
        poll_message_id: int | None = None,
        published_at: str | None = None,
        error: str | None = None,
    ) -> bool:
        fields: list[str] = ["status = ?"]
        params: list[Any] = [status]

        if message_id is not None:
            fields.append("message_id = ?")
            params.append(message_id)
        if poll_message_id is not None:
            fields.append("poll_message_id = ?")
            params.append(poll_message_id)
        if published_at is not None:
            fields.append("published_at = ?")
            params.append(published_at)
        if error is not None:
            fields.append("error = ?")
            params.append(error)

        params.append(record_id)
        query = f"UPDATE publish_records SET {', '.join(fields)} WHERE id = ?"

        async with get_db(self.db_path) as db:
            cursor = await db.execute(query, tuple(params))
            await db.commit()
            return cursor.rowcount > 0

    async def delete(self, record_id: int) -> bool:
        async with get_db(self.db_path) as db:
            cursor = await db.execute(
                "DELETE FROM publish_records WHERE id = ?",
                (record_id,),
            )
            await db.commit()
            return cursor.rowcount > 0

    async def update_schedule(
        self,
        record_id: int,
        scheduled_date: str,
        scheduled_time: str,
        message_id: int,
        poll_message_id: int | None = None,
        error: str | None = None,
    ) -> bool:
        async with get_db(self.db_path) as db:
            cursor = await db.execute(
                """
                UPDATE publish_records
                SET scheduled_date = ?,
                    scheduled_time = ?,
                    message_id = ?,
                    poll_message_id = ?,
                    status = ?,
                    published_at = NULL,
                    error = ?
                WHERE id = ?
                """,
                (
                    scheduled_date,
                    scheduled_time,
                    message_id,
                    poll_message_id,
                    "scheduled",
                    error,
                    record_id,
                ),
            )
            await db.commit()
            return cursor.rowcount > 0

    async def log_attempt(
        self,
        file_name: str,
        attempt_type: str,
        payload_snapshot: Any,
        result: Any,
    ) -> int:
        query = """
            INSERT INTO publish_attempts (
                file_name,
                attempt_type,
                payload_snapshot,
                result
            ) VALUES (?, ?, ?, ?)
        """
        params = (
            file_name,
            attempt_type,
            _serialize_json_value(payload_snapshot),
            _serialize_json_value(result),
        )

        async with get_db(self.db_path) as db:
            cursor = await db.execute(query, params)
            await db.commit()
            return int(cursor.lastrowid)

    async def get_attempts(self, file_name: str | None = None) -> list[PublishAttempt]:
        query = "SELECT * FROM publish_attempts"
        where, params = _build_where_clause(("file_name", file_name))
        query = f"{query}{where} ORDER BY created_at DESC, id DESC"

        async with get_db(self.db_path) as db:
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()

        return [_row_to_attempt(row) for row in rows]


def _build_where_clause(*pairs: tuple[str, str | None]) -> tuple[str, tuple[Any, ...]]:
    clauses: list[str] = []
    params: list[Any] = []

    for field_name, value in pairs:
        if value is None:
            continue
        clauses.append(f"{field_name} = ?")
        params.append(value)

    if not clauses:
        return "", tuple()

    return " WHERE " + " AND ".join(clauses), tuple(params)


def _serialize_json_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _row_to_record(row: Any) -> PublishRecord:
    return PublishRecord(
        id=row["id"],
        file_name=row["file_name"],
        platform=row["platform"],
        scheduled_date=row["scheduled_date"],
        scheduled_time=row["scheduled_time"],
        message_id=row["message_id"],
        poll_message_id=row["poll_message_id"],
        status=row["status"],
        published_at=row["published_at"],
        error=row["error"],
        created_at=row["created_at"],
    )


def _row_to_attempt(row: Any) -> PublishAttempt:
    return PublishAttempt(
        id=row["id"],
        file_name=row["file_name"],
        attempt_type=row["attempt_type"],
        payload_snapshot=row["payload_snapshot"],
        result=row["result"],
        created_at=row["created_at"],
    )
