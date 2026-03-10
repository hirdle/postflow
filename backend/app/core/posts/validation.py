from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict

from app.config import PLATFORM_POLICY, PlatformName, get_platform_policy
from app.core.posts.models import PostModel, ValidationLevel

COMMENT_CTA_PATTERNS = (
    "коммент",
    "комментар",
    "напишите",
    "поделитесь",
    "расскажите",
    "обсудим",
)
PRODUCT_RUBRIC_KEYWORDS = ("product", "продукт", "товар", "аккумулятор")
PRODUCT_FACT_KEYWORDS = (
    "eve",
    "dmegc",
    "xt-60",
    "xt60",
    "гарантия 2 года",
    "2 года",
    "честная емкость",
    "подбор",
)
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "]"
)


class ValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    level: ValidationLevel
    code: str
    message: str


def validate_post(
    post: PostModel,
    platform: PlatformName | None = None,
) -> list[ValidationIssue]:
    resolved_platform = platform or post.platform
    issues: list[ValidationIssue] = []

    for code, predicate, message in (
        ("missing_date", not post.date, "Missing publication date."),
        ("missing_time", not post.time, "Missing publication time."),
        ("missing_platform", not resolved_platform, "Missing target platform."),
        ("missing_title", not post.title, "Missing post title."),
        ("missing_body", not post.body, "Missing post body."),
    ):
        if predicate:
            issues.append(_issue("error", code, message))

    if not resolved_platform:
        return issues

    policy = get_platform_policy(resolved_platform)
    full_text = _compose_text(post)
    full_text_lower = full_text.lower()

    if not post.hook_type:
        issues.append(_issue("warning", "no_hook", "No hook metadata specified."))

    if not _has_comment_cta(full_text_lower):
        issues.append(
            _issue(
                "warning",
                "no_comment_cta",
                "Post does not include a clear comment call-to-action.",
            )
        )

    if policy.platform_link.lower() not in full_text_lower:
        issues.append(
            _issue(
                "warning",
                "no_platform_link",
                f"Post does not mention the platform link {policy.platform_link}.",
            )
        )

    if not post.username:
        issues.append(
            _issue(
                "warning",
                "no_username",
                "Post does not include the expected account username footer.",
            )
        )

    hashtag_count = len(post.hashtags)
    if not policy.min_hashtags <= hashtag_count <= policy.max_hashtags:
        issues.append(
            _issue(
                "warning",
                "hashtag_count",
                (
                    f"Hashtag count {hashtag_count} is outside the "
                    f"{policy.min_hashtags}-{policy.max_hashtags} range for {resolved_platform}."
                ),
            )
        )

    text_length = len(full_text)
    if not policy.min_length <= text_length <= policy.max_length:
        issues.append(
            _issue(
                "warning",
                "post_length",
                (
                    f"Post length {text_length} is outside the "
                    f"{policy.min_length}-{policy.max_length} range for {resolved_platform}."
                ),
            )
        )

    if not policy.emoji_allowed and EMOJI_PATTERN.search(full_text):
        issues.append(
            _issue(
                "warning",
                "has_emoji",
                "Post contains emoji while platform policy forbids it.",
            )
        )

    if not post.has_image:
        issues.append(_issue("info", "no_image", "Post has no attached image."))

    if not post.poll:
        issues.append(_issue("info", "no_poll", "Post has no poll block."))

    if _is_product_post(post) and not _has_product_facts(full_text_lower):
        issues.append(
            _issue(
                "info",
                "no_product_facts",
                "Product-related post does not mention concrete product facts.",
            )
        )

    return issues


def _issue(level: ValidationLevel, code: str, message: str) -> ValidationIssue:
    return ValidationIssue(level=level, code=code, message=message)


def _compose_text(post: PostModel) -> str:
    parts = [part for part in (post.title, post.body, post.username) if part]
    if post.hashtags:
        parts.append(" ".join(f"#{tag}" for tag in post.hashtags))
    return "\n".join(parts).strip()


def _has_comment_cta(full_text_lower: str) -> bool:
    return any(marker in full_text_lower for marker in COMMENT_CTA_PATTERNS)


def _is_product_post(post: PostModel) -> bool:
    rubric = (post.rubric or "").lower()
    post_type = (post.post_type or "").lower()
    return any(keyword in rubric or keyword in post_type for keyword in PRODUCT_RUBRIC_KEYWORDS)


def _has_product_facts(full_text_lower: str) -> bool:
    return any(keyword in full_text_lower for keyword in PRODUCT_FACT_KEYWORDS)


def is_supported_platform(platform: str | None) -> bool:
    return bool(platform and platform in PLATFORM_POLICY)
