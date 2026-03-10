from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.publishing import (
    DuplicatePublishError,
    PublishService,
    PublishValidationError,
)
from app.schemas.publishing import PublishRecord, PublishRequest

router = APIRouter(prefix="/publish", tags=["publish"])


@router.post(
    "/{filename}",
    response_model=PublishRecord,
    status_code=status.HTTP_201_CREATED,
)
async def publish_post(filename: str, payload: PublishRequest) -> PublishRecord:
    service = PublishService()

    try:
        return await service.publish(filename, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PublishValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DuplicatePublishError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Publish failed: {exc}",
        ) from exc
