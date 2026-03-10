from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

PlatformName = Literal["telegram", "vk"]


@dataclass(frozen=True, slots=True)
class PlatformPolicy:
    username: str
    min_length: int
    max_length: int
    emoji_allowed: bool
    min_hashtags: int
    max_hashtags: int
    poll_supported: bool
    platform_link: str


PLATFORM_POLICY: dict[PlatformName, PlatformPolicy] = {
    "telegram": PlatformPolicy(
        username="@biovoltru",
        min_length=500,
        max_length=1500,
        emoji_allowed=False,
        min_hashtags=3,
        max_hashtags=5,
        poll_supported=True,
        platform_link="t.me/biovoltru",
    ),
    "vk": PlatformPolicy(
        username="@biovolt",
        min_length=500,
        max_length=2000,
        emoji_allowed=False,
        min_hashtags=5,
        max_hashtags=10,
        poll_supported=True,
        platform_link="vk.com/biovolt",
    ),
}


@dataclass(frozen=True, slots=True)
class Settings:
    project_name: str
    api_prefix: str
    project_root: Path
    backend_root: Path
    data_dir: Path
    posts_dir: Path
    images_dir: Path
    database_path: Path


def build_settings() -> Settings:
    backend_root = Path(__file__).resolve().parents[1]
    project_root = backend_root.parent
    data_dir = project_root / "data"
    return Settings(
        project_name="PostFlow Backend",
        api_prefix="/api",
        project_root=project_root,
        backend_root=backend_root,
        data_dir=data_dir,
        posts_dir=data_dir / "posts",
        images_dir=data_dir / "images",
        database_path=data_dir / "publish.db",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return build_settings()


def ensure_runtime_directories(settings: Settings | None = None) -> None:
    resolved_settings = settings or get_settings()
    resolved_settings.data_dir.mkdir(parents=True, exist_ok=True)
    resolved_settings.posts_dir.mkdir(parents=True, exist_ok=True)
    resolved_settings.images_dir.mkdir(parents=True, exist_ok=True)


def get_platform_policy(platform: PlatformName) -> PlatformPolicy:
    return PLATFORM_POLICY[platform]
