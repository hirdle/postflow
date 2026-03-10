from __future__ import annotations

from app.core.posts.models import PostModel

PROMPT_HEADER = "## Промпт для генерации изображения (Nano Banana Pro)"


def serialize_post(post: PostModel) -> str:
    metadata_lines = ["---"]
    for key, value in (
        ("date", post.date),
        ("time", post.time),
        ("platform", post.platform),
        ("type", post.post_type),
        ("rubric", post.rubric),
        ("hook_type", post.hook_type),
    ):
        if value is None:
            continue
        metadata_lines.append(f'{key}: "{value}"')
    metadata_lines.append("---")

    body_parts: list[str] = []
    if post.title:
        body_parts.append(f"# {post.title}")
    if post.body:
        body_parts.append(post.body.strip())
    if post.poll:
        options = "\n".join(
            f"{index}) {option}" for index, option in enumerate(post.poll.options, start=1)
        )
        body_parts.append(f"**Опрос:** «{post.poll.question}»\n{options}")
    if post.username:
        body_parts.append(post.username)
    if post.hashtags:
        hashtag_line = " ".join(f"#{tag.lstrip('#')}" for tag in post.hashtags)
        body_parts.append(hashtag_line)
    if post.image_prompt:
        body_parts.append(f"---\n\n{PROMPT_HEADER}\n\n{post.image_prompt.strip()}")

    rendered_body = "\n\n".join(part for part in body_parts if part).strip()
    if rendered_body:
        return "\n".join(metadata_lines) + "\n\n" + rendered_body + "\n"

    return "\n".join(metadata_lines) + "\n"
