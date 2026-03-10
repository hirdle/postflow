from __future__ import annotations

from pathlib import Path
from typing import Protocol

from app.core.media.storage import MediaStorage


class ImageGenerationClient(Protocol):
    async def generate(
        self,
        prompt: str,
        size: str = "1024x1024",
        model: str | None = None,
    ) -> bytes: ...


class ImageService:
    def __init__(self, storage: MediaStorage, api_client: ImageGenerationClient):
        self.storage = storage
        self.api_client = api_client

    async def generate(
        self,
        file_name: str,
        prompt: str,
        model: str | None = None,
        size: str = "1024x1024",
    ) -> Path:
        content = await self.api_client.generate(prompt=prompt, size=size, model=model)
        return await self.storage.save(file_name, content)

    async def upload(self, file_name: str, content: bytes) -> Path:
        return await self.storage.save(file_name, content)

    async def delete(self, file_name: str) -> bool:
        return await self.storage.delete(file_name)

    async def get_path(self, file_name: str) -> Path | None:
        return await self.storage.get_path(file_name)
