from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import aiosqlite

from app.config import get_settings

CREATE_TABLE_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS publish_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        scheduled_date TEXT,
        scheduled_time TEXT,
        message_id INTEGER,
        poll_message_id INTEGER,
        status TEXT NOT NULL,
        published_at TEXT,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS publish_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        attempt_type TEXT NOT NULL,
        payload_snapshot TEXT,
        result TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
)


async def initialize_database(db_path: Path | None = None) -> Path:
    database_path = db_path or get_settings().database_path
    database_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(database_path) as connection:
        await connection.execute("PRAGMA foreign_keys = ON")

        for statement in CREATE_TABLE_STATEMENTS:
            await connection.execute(statement)

        await connection.commit()

    return database_path


@asynccontextmanager
async def get_db(db_path: Path | None = None) -> AsyncIterator[aiosqlite.Connection]:
    database_path = db_path or get_settings().database_path
    database_path.parent.mkdir(parents=True, exist_ok=True)

    connection = await aiosqlite.connect(database_path)
    connection.row_factory = aiosqlite.Row
    await connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
    finally:
        await connection.close()
