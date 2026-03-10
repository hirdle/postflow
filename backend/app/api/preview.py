from __future__ import annotations

from fastapi import APIRouter

from app.core.posts import PostModel, parse_post_content, serialize_post, validate_post
from app.core.preview import format_telegram, format_vk
from app.schemas.preview import PreviewRequest, PreviewResponse

router = APIRouter(prefix="/preview", tags=["preview"])


@router.post("", response_model=PreviewResponse)
async def preview_post(payload: PreviewRequest) -> PreviewResponse:
    file_name = payload.file_name or "draft.md"
    draft_post = PostModel(file_name=file_name, **payload.model_dump(exclude={"file_name"}))
    normalized_markdown = serialize_post(draft_post)
    normalized_post = parse_post_content(normalized_markdown, file_name=file_name)

    rendered_text = _render_preview_text(normalized_post)
    validation_issues = validate_post(normalized_post, normalized_post.platform)

    return PreviewResponse(
        rendered_text=rendered_text,
        poll=normalized_post.poll,
        validation_issues=validation_issues,
        char_count=len(rendered_text),
        platform=normalized_post.platform,
        normalized_post=normalized_post,
    )


def _render_preview_text(post: PostModel) -> str:
    if post.platform == "telegram":
        return format_telegram(post)
    if post.platform == "vk":
        return format_vk(post)
    return _format_generic(post)


def _format_generic(post: PostModel) -> str:
    parts = [part for part in (post.title, post.body, post.username) if part]
    if post.hashtags:
        parts.append(" ".join(f"#{tag}" for tag in post.hashtags))
    return "\n\n".join(parts).strip()
