from __future__ import annotations

import unittest
from contextlib import asynccontextmanager
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from openai import RateLimitError

from app.api.media import generate_media
from app.schemas.media import MediaGenerateRequest


class FakeImageService:
    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    async def generate(
        self,
        file_name: str,
        prompt: str,
        model: str | None = None,
        size: str = "1024x1024",
    ) -> None:
        raise self._exc


@asynccontextmanager
async def fake_managed_image_client():
    yield object()


class MediaApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_media_surfaces_upstream_rate_limit(self) -> None:
        response = httpx.Response(
            429,
            request=httpx.Request("POST", "https://api.example.test/v1/images/generations"),
            json={
                "error": {
                    "message": "Too many requests. This request requires 7 RPM slots, but only 3 available (10 per minute).",
                }
            },
        )
        error = RateLimitError(
            "Error code: 429",
            response=response,
            body=response.json(),
        )

        with (
            patch("app.api.media._managed_image_client", fake_managed_image_client),
            patch("app.api.media._build_image_service", return_value=FakeImageService(error)),
        ):
            with self.assertRaises(HTTPException) as raised:
                await generate_media(
                    MediaGenerateRequest(
                        file_name="2026-03-30-vk-02.md",
                        prompt="battery prompt",
                    )
                )

        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(
            raised.exception.detail,
            "Too many requests. This request requires 7 RPM slots, but only 3 available (10 per minute).",
        )
