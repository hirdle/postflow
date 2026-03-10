from __future__ import annotations

import re
from pathlib import Path

import frontmatter

from app.config import get_settings
from app.core.posts.models import PollData, PostModel

TITLE_PATTERN = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
OPTION_PATTERN = re.compile(r"^\s*(\d+)[.)]\s*(.+?)\s*$")
HASHTAG_LINE_PATTERN = re.compile(r"^(?:#\S+\s*)+$")
USERNAME_LINE_PATTERN = re.compile(r"^@\S+$")
PROMPT_SEPARATOR_PATTERN = re.compile(r"\n\s*---\s*\n", re.MULTILINE)
IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")


def parse_post_file(file_path: Path) -> PostModel:
    resolved_path = Path(file_path)
    return parse_post_content(
        resolved_path.read_text(encoding="utf-8"),
        file_name=resolved_path.name,
    )


def parse_post_content(content: str, file_name: str) -> PostModel:
    metadata, markdown_body = _parse_frontmatter(content)
    main_content, image_prompt = _split_image_prompt(markdown_body)
    main_content, poll = _extract_poll(main_content)
    main_content, username, hashtags = _extract_footer_lines(main_content)
    title = _extract_title(main_content)
    body = _extract_body(main_content, title)

    return PostModel(
        file_name=file_name,
        date=metadata.get("date"),
        time=metadata.get("time"),
        platform=metadata.get("platform"),
        post_type=metadata.get("type"),
        rubric=metadata.get("rubric"),
        hook_type=metadata.get("hook_type"),
        title=title,
        body=body,
        username=username,
        hashtags=hashtags,
        poll=poll,
        image_prompt=image_prompt,
        has_image=_has_image(file_name),
    )


def _parse_frontmatter(content: str) -> tuple[dict[str, object], str]:
    try:
        document = frontmatter.loads(content)
    except Exception:
        return {}, content

    return document.metadata, document.content


def _split_image_prompt(content: str) -> tuple[str, str | None]:
    parts = PROMPT_SEPARATOR_PATTERN.split(content)
    if len(parts) < 2:
        return content, None

    prompt_section = parts[-1].strip()
    prompt_lines = []
    for line in prompt_section.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("## "):
            continue
        prompt_lines.append(stripped)

    main_content = "\n---\n".join(parts[:-1]).strip()
    image_prompt = "\n".join(prompt_lines).strip() or None
    return main_content, image_prompt


def _extract_title(content: str) -> str | None:
    match = TITLE_PATTERN.search(content)
    if not match:
        return None
    return match.group(1).strip() or None


def _extract_body(content: str, title: str | None) -> str | None:
    body = content.strip()
    if title:
        body = TITLE_PATTERN.sub("", body, count=1).strip()

    return body or None


def _extract_poll(content: str) -> tuple[str, PollData | None]:
    lines = content.splitlines()
    for index, raw_line in enumerate(lines):
        stripped_line = raw_line.strip()
        if not stripped_line.startswith("**Опрос:**"):
            continue

        question = _normalize_poll_question(stripped_line)
        option_indices: list[int] = []
        options: list[str] = []

        probe_index = index + 1
        while probe_index < len(lines):
            option_match = OPTION_PATTERN.match(lines[probe_index])
            if option_match:
                option_indices.append(probe_index)
                options.append(option_match.group(2).strip())
                probe_index += 1
                continue

            if lines[probe_index].strip():
                break

            probe_index += 1

        if question and len(options) >= 2:
            consumed_indices = {index, *option_indices}
            cleaned_lines = [
                line for line_index, line in enumerate(lines) if line_index not in consumed_indices
            ]
            return "\n".join(cleaned_lines).strip(), PollData(question=question, options=options)

    return content, None


def _normalize_poll_question(line: str) -> str | None:
    question = line.split("**Опрос:**", maxsplit=1)[1].strip()
    if not question:
        return None

    return question.strip("«»\"' ").strip() or None


def _extract_footer_lines(content: str) -> tuple[str, str | None, list[str]]:
    username: str | None = None
    hashtags: list[str] = []
    kept_lines: list[str] = []

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            kept_lines.append("")
            continue

        if USERNAME_LINE_PATTERN.fullmatch(stripped):
            username = stripped
            continue

        if HASHTAG_LINE_PATTERN.fullmatch(stripped):
            hashtags.extend(re.findall(r"#(\S+)", stripped))
            continue

        kept_lines.append(line)

    cleaned_content = "\n".join(kept_lines).strip()
    return cleaned_content, username, hashtags


def _has_image(file_name: str) -> bool:
    images_dir = get_settings().images_dir
    stem = Path(file_name).stem
    return any((images_dir / f"{stem}{suffix}").exists() for suffix in IMAGE_SUFFIXES)
