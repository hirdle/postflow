from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status

from app.config import get_platform_policy, get_settings
from app.core.posts import PostModel, parse_post_file, serialize_post
from app.core.publishing import StatusRepository
from app.schemas.posts import PostCreate, PostDetail, PostListItem, PostUpdate

router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("", response_model=list[PostListItem])
async def list_posts(
    platform: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    rubric: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> list[PostListItem]:
    posts_dir = get_settings().posts_dir
    status_map = await _build_status_map()
    normalized_search = search.lower().strip() if search else None
    normalized_rubric = rubric.lower().strip() if rubric else None

    items: list[PostListItem] = []
    for path in sorted(posts_dir.glob("*.md")):
        post = parse_post_file(path)
        current_status = status_map.get(post.file_name, "draft")

        if platform and post.platform != platform:
            continue
        if status_filter and current_status != status_filter:
            continue
        if date_from and (not post.date or post.date < date_from):
            continue
        if date_to and (not post.date or post.date > date_to):
            continue
        if normalized_rubric and (post.rubric or "").lower() != normalized_rubric:
            continue
        if normalized_search:
            haystack = " ".join(filter(None, [post.title, post.body])).lower()
            if normalized_search not in haystack:
                continue

        items.append(
            PostListItem(
                file_name=post.file_name,
                date=post.date,
                time=post.time,
                platform=post.platform,
                post_type=post.post_type,
                rubric=post.rubric,
                title=post.title,
                status=current_status,
                has_image=post.has_image,
                has_poll=post.poll is not None,
            )
        )

    items.sort(
        key=lambda item: (
            item.date or "",
            item.time or "",
            item.file_name,
        ),
        reverse=True,
    )
    return items


@router.get("/{filename}", response_model=PostDetail)
async def get_post(filename: str) -> PostDetail:
    post_path = _resolve_post_path(filename)
    raw_markdown = post_path.read_text(encoding="utf-8")
    post = parse_post_file(post_path)
    current_status = await _get_current_status(filename)
    return _to_post_detail(post, raw_markdown, current_status)


@router.post(
    "",
    response_model=PostDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_post(payload: PostCreate) -> PostDetail:
    settings = get_settings()
    file_name = _generate_file_name(settings.posts_dir, payload.date, payload.platform)
    username = payload.username or get_platform_policy(payload.platform).username

    post = PostModel(
        file_name=file_name,
        date=payload.date,
        time=payload.time,
        platform=payload.platform,
        post_type=payload.post_type,
        rubric=payload.rubric,
        hook_type=payload.hook_type,
        title=payload.title,
        body=payload.body,
        username=username,
        hashtags=payload.hashtags,
        poll=payload.poll,
        image_prompt=payload.image_prompt,
        has_image=False,
    )
    raw_markdown = serialize_post(post)
    post_path = settings.posts_dir / file_name
    post_path.write_text(raw_markdown, encoding="utf-8")

    return _to_post_detail(post, raw_markdown, "draft")


@router.put("/{filename}", response_model=PostDetail)
async def update_post(filename: str, payload: PostUpdate) -> PostDetail:
    post_path = _resolve_post_path(filename)
    existing = parse_post_file(post_path)
    updated = existing.model_copy(update=payload.model_dump(exclude_unset=True))
    updated = updated.model_copy(update={"file_name": existing.file_name})

    raw_markdown = serialize_post(updated)
    post_path.write_text(raw_markdown, encoding="utf-8")

    reparsed = parse_post_file(post_path)
    current_status = await _get_current_status(filename)
    return _to_post_detail(reparsed, raw_markdown, current_status)


async def _build_status_map() -> dict[str, str]:
    repository = StatusRepository()
    records = await repository.list()
    status_map: dict[str, str] = {}

    for record in records:
        status_map.setdefault(record.file_name, record.status)

    return status_map


async def _get_current_status(file_name: str) -> str:
    repository = StatusRepository()
    records = await repository.find(file_name)
    if not records:
        return "draft"
    return records[0].status


def _resolve_post_path(filename: str) -> Path:
    if Path(filename).name != filename or not filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="Invalid post filename.")

    post_path = get_settings().posts_dir / filename
    if not post_path.exists():
        raise HTTPException(status_code=404, detail="Post not found.")
    return post_path


def _generate_file_name(posts_dir: Path, date: str, platform: str) -> str:
    prefix = f"{date}-{platform}-"
    existing_numbers = []
    for path in posts_dir.glob(f"{prefix}*.md"):
        suffix = path.stem.removeprefix(prefix)
        if suffix.isdigit():
            existing_numbers.append(int(suffix))

    next_number = (max(existing_numbers) + 1) if existing_numbers else 1
    return f"{prefix}{next_number:02d}.md"


def _to_post_detail(post: PostModel, raw_markdown: str, current_status: str) -> PostDetail:
    return PostDetail(
        **post.model_dump(),
        status=current_status,
        raw_markdown=raw_markdown,
    )
