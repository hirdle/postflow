import type { ValidationIssue } from "../types";

function platformLabel(value: string | undefined) {
  if (value === "telegram") {
    return "Telegram";
  }
  if (value === "vk") {
    return "VK";
  }
  return value ?? "выбранной платформы";
}

export function formatValidationIssueMessage(issue: ValidationIssue) {
  if (issue.code === "missing_date") {
    return "Не указана дата публикации.";
  }
  if (issue.code === "missing_time") {
    return "Не указано время публикации.";
  }
  if (issue.code === "missing_platform") {
    return "Не выбрана целевая платформа.";
  }
  if (issue.code === "missing_title") {
    return "Не заполнен заголовок поста.";
  }
  if (issue.code === "missing_body") {
    return "Не заполнен текст поста.";
  }
  if (issue.code === "no_hook") {
    return "Не заполнен метатег хука.";
  }
  if (issue.code === "no_comment_cta") {
    return "В посте нет явного призыва к комментариям.";
  }
  if (issue.code === "no_username") {
    return "В посте нет ожидаемого футера с юзернеймом аккаунта.";
  }
  if (issue.code === "has_emoji") {
    return "В посте есть эмодзи, хотя правила платформы этого не допускают.";
  }
  if (issue.code === "no_image") {
    return "К посту не прикреплено изображение.";
  }
  if (issue.code === "no_poll") {
    return "В посте нет блока опроса.";
  }
  if (issue.code === "no_product_facts") {
    return "В продуктовом посте не хватает конкретных фактов о товаре.";
  }

  if (issue.code === "no_platform_link") {
    const match = issue.message.match(/platform link (.+)\./i);
    return match
      ? `В тексте нет ссылки на платформу ${match[1]}.`
      : "В тексте нет ссылки на целевую платформу.";
  }

  if (issue.code === "hashtag_count") {
    const match = issue.message.match(
      /Hashtag count (\d+) is outside the (\d+)-(\d+) range for (\w+)\./i,
    );

    if (match) {
      const [, actual, min, max, platform] = match;
      return `Количество хэштегов (${actual}) вне диапазона ${min}-${max} для ${platformLabel(platform.toLowerCase())}.`;
    }

    return "Количество хэштегов не соответствует требованиям платформы.";
  }

  if (issue.code === "post_length") {
    const match = issue.message.match(
      /Post length (\d+) is outside the (\d+)-(\d+) range for (\w+)\./i,
    );

    if (match) {
      const [, actual, min, max, platform] = match;
      return `Длина поста (${actual} символов) вне диапазона ${min}-${max} для ${platformLabel(platform.toLowerCase())}.`;
    }

    return "Длина поста не соответствует требованиям платформы.";
  }

  return issue.message;
}
