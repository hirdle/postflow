export function formatScheduleValue(
  date: string | null | undefined,
  time: string | null | undefined,
  fallback = "Не запланировано",
) {
  if (!date && !time) {
    return fallback;
  }

  if (date && time) {
    return `${formatDateValue(date)} • ${time}`;
  }

  if (date) {
    return formatDateValue(date);
  }

  return time ?? fallback;
}

export function formatDateValue(
  value: string | null | undefined,
  fallback = "Дата не указана",
) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function formatTimestampValue(
  value: string | null | undefined,
  fallback = "Дата недоступна",
) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}
