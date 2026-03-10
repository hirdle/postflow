from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.config import get_settings
from app.core.media import ImageService, MediaStorage
from app.infra import ImageApiClient
from app.schemas.media import (
    MediaGenerateRequest,
    MediaGenerateResponse,
    MediaModelInfo,
    MediaUploadResponse,
)

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/models", response_model=list[MediaModelInfo])
async def list_media_models() -> list[MediaModelInfo]:
    try:
        async with _managed_image_client() as client:
            models = await client.list_models()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to load image models from the upstream API.",
        ) from exc

    return [MediaModelInfo(**model) for model in models]


@router.post(
    "/upload/{filename}",
    response_model=MediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_media(filename: str, file: UploadFile = File(...)) -> MediaUploadResponse:
    normalized_file_name = _normalize_media_file_name(filename)

    try:
        content = await file.read()
        saved_path = await _build_media_storage().save(normalized_file_name, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()

    return MediaUploadResponse(
        file_name=normalized_file_name,
        image_path=_format_image_path(saved_path),
    )


@router.post(
    "/generate",
    response_model=MediaGenerateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_media(payload: MediaGenerateRequest) -> MediaGenerateResponse:
    normalized_file_name = _normalize_media_file_name(payload.file_name)

    try:
        async with _managed_image_client() as client:
            service = _build_image_service(client)
            saved_path = await service.generate(
                file_name=normalized_file_name,
                prompt=payload.prompt,
                model=payload.model,
                size=payload.size,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Image generation failed.",
        ) from exc

    return MediaGenerateResponse(
        file_name=normalized_file_name,
        image_path=_format_image_path(saved_path),
        model=payload.model,
    )


@router.get("/{filename}")
async def get_media(filename: str) -> FileResponse:
    normalized_file_name = _normalize_media_file_name(filename)
    image_path = await _resolve_image_path(normalized_file_name)
    return FileResponse(image_path, media_type="image/png")


@router.delete("/{filename}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(filename: str) -> Response:
    normalized_file_name = _normalize_media_file_name(filename)
    deleted = await _build_media_storage().delete(normalized_file_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Image not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _build_media_storage() -> MediaStorage:
    return MediaStorage(get_settings().images_dir)


def _build_image_service(client: ImageApiClient) -> ImageService:
    return ImageService(storage=_build_media_storage(), api_client=client)


@asynccontextmanager
async def _managed_image_client() -> AsyncIterator[ImageApiClient]:
    client = await ImageApiClient.from_settings()
    try:
        yield client
    finally:
        await client.close()


def _normalize_media_file_name(file_name: str) -> str:
    normalized = file_name.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Filename must not be empty.")
    if Path(normalized).name != normalized:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    return normalized


async def _resolve_image_path(file_name: str) -> Path:
    image_path = await _build_media_storage().get_path(file_name)
    if image_path is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    return image_path


def _format_image_path(path: Path) -> str:
    settings = get_settings()
    try:
        return str(path.relative_to(settings.project_root))
    except ValueError:
        return str(path)
