from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

SUPPORTED_UPLOAD_FORMATS = {"PNG", "JPEG", "WEBP"}


class MediaStorage:
    def __init__(self, images_dir: Path):
        self.images_dir = images_dir

    async def save(self, file_name: str, content: bytes) -> Path:
        target_path = self._target_path(file_name)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        png_bytes = await _convert_to_png_bytes(content)
        target_path.write_bytes(png_bytes)
        return target_path

    async def get_path(self, file_name: str) -> Path | None:
        target_path = self._target_path(file_name)
        return target_path if target_path.exists() else None

    async def delete(self, file_name: str) -> bool:
        target_path = self._target_path(file_name)
        if not target_path.exists():
            return False
        target_path.unlink()
        return True

    async def exists(self, file_name: str) -> bool:
        return (await self.get_path(file_name)) is not None

    def _target_path(self, file_name: str) -> Path:
        return self.images_dir / f"{Path(file_name).stem}.png"


async def _convert_to_png_bytes(content: bytes) -> bytes:
    try:
        with Image.open(BytesIO(content)) as image:
            if image.format not in SUPPORTED_UPLOAD_FORMATS:
                raise ValueError("Only PNG, JPG/JPEG and WEBP uploads are supported.")

            output = BytesIO()
            converted = image.convert("RGBA")
            converted.save(output, format="PNG")
            return output.getvalue()
    except UnidentifiedImageError as exc:
        raise ValueError("Uploaded content is not a valid image.") from exc
