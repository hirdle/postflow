from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


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
