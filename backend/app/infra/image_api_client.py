from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI
from PIL import Image, UnidentifiedImageError

from app.infra.database import get_db

IMAGE_SETTINGS_KEYS = (
    "image_api_key",
    "image_base_url",
    "image_default_model",
)
DEFAULT_IMAGE_API_BASE_URL = "https://api.hydraai.ru/v1/"
DEFAULT_IMAGE_MODEL = "hydra-banana"
CHAT_COMPLETION_MODELS = {"hydra-banana"}
IMAGE_DATA_URL_PATTERN = re.compile(
    r"data:image/[^;]+;base64,([A-Za-z0-9+/=\s]+)"
)
BASE64_PAYLOAD_PATTERN = re.compile(r"^[A-Za-z0-9+/=\s]+$")


@dataclass(frozen=True, slots=True)
class ImageApiSettings:
    api_key: str
    base_url: str
    default_model: str


async def load_image_api_settings(db_path: Path | None = None) -> ImageApiSettings:
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)",
            IMAGE_SETTINGS_KEYS,
        )
        rows = await cursor.fetchall()

    settings_map = {key: None for key in IMAGE_SETTINGS_KEYS}
    settings_map.update({row["key"]: row["value"] for row in rows})

    api_key = (settings_map["image_api_key"] or "").strip()
    if not api_key:
        raise ValueError("Image API key is not configured in app_settings.")

    base_url = (settings_map["image_base_url"] or "").strip() or DEFAULT_IMAGE_API_BASE_URL
    default_model = (
        (settings_map["image_default_model"] or "").strip() or DEFAULT_IMAGE_MODEL
    )

    return ImageApiSettings(
        api_key=api_key,
        base_url=base_url,
        default_model=default_model,
    )


class ImageApiClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_IMAGE_API_BASE_URL,
        default_model: str = DEFAULT_IMAGE_MODEL,
        client: AsyncOpenAI | Any | None = None,
    ) -> None:
        normalized_api_key = api_key.strip()
        if not normalized_api_key:
            raise ValueError("api_key must not be empty.")

        normalized_base_url = base_url.strip() or DEFAULT_IMAGE_API_BASE_URL
        normalized_default_model = default_model.strip() or DEFAULT_IMAGE_MODEL

        self.api_key = normalized_api_key
        self.base_url = normalized_base_url
        self.default_model = normalized_default_model
        self._client = client or AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )
        self._owns_client = client is None

    @classmethod
    async def from_settings(
        cls,
        db_path: Path | None = None,
        client: AsyncOpenAI | Any | None = None,
    ) -> ImageApiClient:
        settings = await load_image_api_settings(db_path)
        return cls(
            api_key=settings.api_key,
            base_url=settings.base_url,
            default_model=settings.default_model,
            client=client,
        )

    async def generate(
        self,
        prompt: str,
        size: str = "1024x1024",
        model: str | None = None,
    ) -> bytes:
        normalized_prompt = prompt.strip()
        if not normalized_prompt:
            raise ValueError("prompt must not be empty.")

        target_model = (model or self.default_model).strip() or self.default_model
        if target_model in CHAT_COMPLETION_MODELS:
            content = await self._generate_via_chat(target_model, normalized_prompt)
        else:
            content = await self._generate_via_images(
                target_model,
                normalized_prompt,
                size,
            )

        return _normalize_to_png_bytes(content)

    async def list_models(self) -> list[dict[str, str | None]]:
        response = await self._client.models.list()
        return [
            {
                "id": model.id,
                "owned_by": getattr(model, "owned_by", None),
            }
            for model in response.data
        ]

    async def close(self) -> None:
        if self._owns_client and hasattr(self._client, "close"):
            await self._client.close()

    async def _generate_via_chat(self, model: str, prompt: str) -> bytes:
        response = await self._client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        content = _coerce_message_content(response.choices[0].message.content)
        image_payload = _extract_base64_payload(content)
        return base64.b64decode(image_payload)

    async def _generate_via_images(
        self,
        model: str,
        prompt: str,
        size: str,
    ) -> bytes:
        response = await self._client.images.generate(
            model=model,
            prompt=prompt,
            size=size,
            n=1,
            response_format="b64_json",
        )
        if not response.data:
            raise ValueError("Image generation response did not include image data.")

        image_payload = _extract_base64_payload(response.data[0].b64_json or "")
        return base64.b64decode(image_payload)


def _coerce_message_content(content: object) -> str:
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        fragments: list[str] = []
        for item in content:
            if isinstance(item, str):
                fragments.append(item)
                continue

            text_value = getattr(item, "text", None)
            if isinstance(text_value, str):
                fragments.append(text_value)
                continue

            if isinstance(item, dict):
                if isinstance(item.get("text"), str):
                    fragments.append(item["text"])
                elif isinstance(item.get("content"), str):
                    fragments.append(item["content"])

        return "\n".join(fragment for fragment in fragments if fragment)

    raise ValueError("Unsupported chat response content format.")


def _extract_base64_payload(payload: str) -> str:
    normalized_payload = payload.strip()
    if not normalized_payload:
        raise ValueError("Image payload is empty.")

    match = IMAGE_DATA_URL_PATTERN.search(normalized_payload)
    if match:
        return "".join(match.group(1).split())

    if normalized_payload.startswith("data:") and "," in normalized_payload:
        return "".join(normalized_payload.split(",", 1)[1].split())

    if BASE64_PAYLOAD_PATTERN.fullmatch(normalized_payload):
        return "".join(normalized_payload.split())

    preview = normalized_payload[:200]
    raise ValueError(f"Could not extract image data from response: {preview}")


def _normalize_to_png_bytes(content: bytes) -> bytes:
    try:
        with Image.open(BytesIO(content)) as image:
            output = BytesIO()
            image.convert("RGBA").save(output, format="PNG")
            return output.getvalue()
    except UnidentifiedImageError as exc:
        raise ValueError("Image API response is not a valid image.") from exc
