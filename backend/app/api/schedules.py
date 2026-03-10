from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.core.publishing import PublishService, PublishValidationError, ScheduleStateError
from app.schemas.publishing import PublishRecord, ScheduleUpdateRequest, ScheduledPost

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("", response_model=list[ScheduledPost])
async def list_schedules() -> list[ScheduledPost]:
    service = PublishService()
    return await service.list_schedules()


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_schedule(record_id: int) -> Response:
    service = PublishService()

    try:
        await service.cancel_schedule(record_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ScheduleStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Schedule cancellation failed: {exc}",
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{record_id}", response_model=PublishRecord)
async def reschedule_post(
    record_id: int,
    payload: ScheduleUpdateRequest,
) -> PublishRecord:
    service = PublishService()

    try:
        return await service.reschedule(record_id, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (PublishValidationError, ScheduleStateError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Schedule reschedule failed: {exc}",
        ) from exc
