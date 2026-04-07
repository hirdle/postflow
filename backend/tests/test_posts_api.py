from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.api.posts import list_posts
from app.config import Settings
from app.core.posts import PostModel, serialize_post
from app.infra.database import initialize_database


class PostsApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_posts_returns_newest_posts_first(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            data_dir = root / "data"
            posts_dir = data_dir / "posts"
            images_dir = data_dir / "images"
            database_path = data_dir / "publish.db"

            posts_dir.mkdir(parents=True)
            images_dir.mkdir(parents=True)
            await initialize_database(database_path)

            settings = Settings(
                project_name="PostFlow Backend",
                api_prefix="/api",
                project_root=root,
                backend_root=root / "backend",
                data_dir=data_dir,
                posts_dir=posts_dir,
                images_dir=images_dir,
                database_path=database_path,
            )

            self._write_post(
                posts_dir,
                PostModel(
                    file_name="2026-04-01-telegram-01.md",
                    date="2026-04-01",
                    time="10:00",
                    platform="telegram",
                    title="Older",
                    body="Older body",
                ),
            )
            self._write_post(
                posts_dir,
                PostModel(
                    file_name="2026-04-02-vk-01.md",
                    date="2026-04-02",
                    time="12:00",
                    platform="vk",
                    title="Newest",
                    body="Newest body",
                ),
            )
            self._write_post(
                posts_dir,
                PostModel(
                    file_name="2026-04-02-telegram-01.md",
                    date="2026-04-02",
                    time="08:00",
                    platform="telegram",
                    title="Middle",
                    body="Middle body",
                ),
            )

            with (
                patch("app.api.posts.get_settings", return_value=settings),
                patch("app.core.posts.parser.get_settings", return_value=settings),
                patch("app.infra.database.get_settings", return_value=settings),
            ):
                items = await list_posts(None, None, None, None, None, None)

        self.assertEqual(
            [item.file_name for item in items],
            [
                "2026-04-02-vk-01.md",
                "2026-04-02-telegram-01.md",
                "2026-04-01-telegram-01.md",
            ],
        )

    def _write_post(self, posts_dir: Path, post: PostModel) -> None:
        (posts_dir / post.file_name).write_text(serialize_post(post), encoding="utf-8")
