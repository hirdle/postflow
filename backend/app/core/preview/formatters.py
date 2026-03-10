from __future__ import annotations

import html
import re

from app.core.posts.models import PostModel

BOLD_PATTERN = re.compile(r"\*\*(.+?)\*\*")
ITALIC_STAR_PATTERN = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
ITALIC_UNDERSCORE_PATTERN = re.compile(r"(?<!_)_(?!_)(.+?)(?<!_)_(?!_)")


def format_telegram(post: PostModel) -> str:
    parts: list[str] = []

    if post.title:
        parts.append(f"<b>{_escape_html(post.title)}</b>")

    body = _md_to_html(html.unescape(post.body or ""))
    if body:
        if parts:
            parts.append("")
        parts.append(body)

    _append_footer(parts, post)
    return "\n".join(parts).strip()


def format_vk(post: PostModel) -> str:
    parts: list[str] = []

    if post.title:
        parts.append(post.title)

    body = _strip_markdown(html.unescape(post.body or ""))
    if body:
        if parts:
            parts.append("")
        parts.append(body)

    _append_footer(parts, post)
    return "\n".join(parts).strip()


def _append_footer(parts: list[str], post: PostModel) -> None:
    if post.username:
        if parts:
            parts.append("")
        parts.append(post.username)

    if post.hashtags:
        if parts:
            parts.append("")
        parts.append(" ".join(f"#{tag}" for tag in post.hashtags))


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _md_to_html(text: str) -> str:
    escaped = _escape_html(text)
    escaped = BOLD_PATTERN.sub(r"<b>\1</b>", escaped)
    escaped = ITALIC_STAR_PATTERN.sub(r"<i>\1</i>", escaped)
    escaped = ITALIC_UNDERSCORE_PATTERN.sub(r"<i>\1</i>", escaped)
    return escaped.strip()


def _strip_markdown(text: str) -> str:
    plain = BOLD_PATTERN.sub(r"\1", text)
    plain = ITALIC_STAR_PATTERN.sub(r"\1", plain)
    plain = ITALIC_UNDERSCORE_PATTERN.sub(r"\1", plain)
    return plain.strip()
