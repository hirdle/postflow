import { PlatformBadge } from "./PlatformBadge";
import { PresenceBadge } from "./PresenceBadge";
import { StatusBadge } from "./StatusBadge";
import {
  formatBackendErrorMessage,
  isSettingsConfigurationErrorMessage,
} from "../lib/errors";
import { formatScheduleValue, formatTimestampValue } from "../lib/format";
import type {
  PublishAttempt,
  PublishRecord,
  PublishStatus,
} from "../types";

interface PublicationStatusPanelProps {
  fileName?: string;
  status: PublishStatus;
  publishRecords: PublishRecord[];
  publishAttempts: PublishAttempt[];
}

interface AttemptMeta {
  error: string | null;
  issues: string[];
  status: string | null;
}

function formatTimestamp(value: string | null) {
  return formatTimestampValue(value);
}

function formatSchedule(record: PublishRecord) {
  return formatScheduleValue(record.scheduled_date, record.scheduled_time, "Сразу после подтверждения");
}

function formatAttemptType(value: string) {
  if (value === "publish") {
    return "Публикация";
  }
  if (value === "cancel") {
    return "Отмена";
  }
  if (value === "reschedule") {
    return "Перенос";
  }
  return value;
}

function formatPlatform(value: string) {
  return value === "telegram" ? "Telegram" : value === "vk" ? "VK" : value;
}

function formatStatusValue(value: string | null) {
  if (value === "draft") {
    return "черновик";
  }
  if (value === "scheduled") {
    return "запланирован";
  }
  if (value === "published") {
    return "опубликован";
  }
  if (value === "failed") {
    return "ошибка";
  }
  if (value === "cancelled") {
    return "отменен";
  }
  if (value === "success") {
    return "успешно";
  }
  if (value === "failure") {
    return "ошибка";
  }
  return value ?? "неизвестно";
}

function parseAttemptMeta(attempt: PublishAttempt): AttemptMeta {
  if (!attempt.result) {
    return {
      error: null,
      issues: [],
      status: null,
    };
  }

  try {
    const parsed = JSON.parse(attempt.result) as Record<string, unknown>;
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues
          .map((issue) => {
            if (typeof issue === "string") {
              return issue;
            }
            if (
              issue &&
              typeof issue === "object" &&
              typeof (issue as { message?: unknown }).message === "string"
            ) {
              return (issue as { message: string }).message;
            }
            return null;
          })
          .filter((issue): issue is string => Boolean(issue))
      : [];

    return {
      error:
        typeof parsed.error === "string" && parsed.error.trim()
          ? parsed.error
          : null,
      issues,
      status:
        typeof parsed.status === "string" && parsed.status.trim()
          ? parsed.status
          : null,
    };
  } catch {
    return {
      error: null,
      issues: [],
      status: attempt.result,
    };
  }
}

function buildErrorJournal(
  publishRecords: PublishRecord[],
  publishAttempts: PublishAttempt[],
) {
  const recordErrors = publishRecords
    .filter(
      (record) =>
        record.error && !isSettingsConfigurationErrorMessage(record.error),
    )
    .map((record) => ({
      id: `record-${record.id ?? record.created_at ?? record.file_name}`,
      title: `${formatPlatform(record.platform)} • ${formatStatusValue(record.status)}`,
      message: formatBackendErrorMessage(record.error ?? ""),
      timestamp: record.published_at ?? record.created_at,
    }));

  const attemptErrors = publishAttempts
    .map((attempt) => ({
      attempt,
      meta: parseAttemptMeta(attempt),
    }))
    .map(({ attempt, meta }) => ({
      attempt,
      meta: {
        ...meta,
        error:
          meta.error && !isSettingsConfigurationErrorMessage(meta.error)
            ? meta.error
            : null,
        issues: meta.issues.filter(
          (issue) => !isSettingsConfigurationErrorMessage(issue),
        ),
      },
    }))
    .filter(({ meta }) => meta.error || meta.issues.length > 0)
    .map(({ attempt, meta }) => ({
      id: `attempt-${attempt.id ?? attempt.created_at ?? attempt.file_name}`,
      title: `${formatAttemptType(attempt.attempt_type)} • ${formatStatusValue(meta.status)}`,
      message: meta.error
        ? formatBackendErrorMessage(meta.error)
        : meta.issues.map(formatBackendErrorMessage).join("; "),
      timestamp: attempt.created_at,
    }));

  return [...recordErrors, ...attemptErrors].slice(0, 6);
}

export function PublicationStatusPanel({
  fileName,
  status,
  publishRecords,
  publishAttempts,
}: PublicationStatusPanelProps) {
  const latestRecord = publishRecords[0] ?? null;
  const latestAttempt = publishAttempts[0] ?? null;
  const errorJournal = buildErrorJournal(publishRecords, publishAttempts);

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm"
      data-publication-status-section="true"
      data-publication-records-count={publishRecords.length}
      data-publication-attempts-count={publishAttempts.length}
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-950">
            Статус публикации
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Актуальное состояние, история записей и журнал попыток из бэкенда.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge status={status} />
          <PresenceBadge
            label={`${publishRecords.length} записей`}
            active={publishRecords.length > 0}
          />
          <PresenceBadge
            label={`${publishAttempts.length} попыток`}
            active={publishAttempts.length > 0}
          />
        </div>
      </div>

      {!fileName ? (
        <p className="mt-5 text-sm text-slate-500">
          Сначала сохраните черновик. История публикации появится, когда у поста
          будет стабильное имя файла и записи в SQLite.
        </p>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Текущее состояние
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {latestRecord
                      ? "Статус определяется по самой новой записи о публикации."
                      : "Для этого поста пока нет записей о публикации."}
                  </p>
                </div>
                {latestRecord ? (
                  <PlatformBadge platform={latestRecord.platform} />
                ) : null}
              </div>

              {latestRecord ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Последнее событие
                    </p>
                    <p className="mt-2 text-sm text-slate-900">
                      {formatTimestamp(
                        latestRecord.published_at ?? latestRecord.created_at,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Целевой слот
                    </p>
                    <p className="mt-2 text-sm text-slate-900">
                      {formatSchedule(latestRecord)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      ID сообщения
                    </p>
                    <p className="mt-2 text-sm text-slate-900">
                      {latestRecord.message_id ?? "Не сохранен"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      ID сообщения опроса
                    </p>
                    <p className="mt-2 text-sm text-slate-900">
                      {latestRecord.poll_message_id ?? "Без опроса"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  История публикаций
                </h4>
                <span className="text-sm text-slate-500">
                  {publishRecords.length} записей
                </span>
              </div>

              {publishRecords.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {publishRecords.map((record) => (
                    <article
                      key={record.id ?? `${record.file_name}-${record.created_at}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={record.status} />
                        <PlatformBadge platform={record.platform} />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Время
                          </p>
                          <p className="mt-1 text-sm text-slate-900">
                            {formatTimestamp(
                              record.published_at ?? record.created_at,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Слот
                          </p>
                      <p className="mt-1 text-sm text-slate-900">
                        {formatSchedule(record)}
                      </p>
                    </div>
                  </div>
                      {record.error &&
                      !isSettingsConfigurationErrorMessage(record.error) ? (
                        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                          {formatBackendErrorMessage(record.error)}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Пока нет записей о публикации. Раздел заполнится после первой
                  публикации, постановки в очередь, отмены или ошибки.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Журнал попыток
                </h4>
                <span className="text-sm text-slate-500">
                  {publishAttempts.length} попыток
                </span>
              </div>

              {publishAttempts.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {publishAttempts.map((attempt) => {
                    const meta = parseAttemptMeta(attempt);
                    const displayError =
                      meta.error &&
                      !isSettingsConfigurationErrorMessage(meta.error)
                        ? meta.error
                        : null;
                    const displayIssues = meta.issues.filter(
                      (issue) => !isSettingsConfigurationErrorMessage(issue),
                    );

                    return (
                      <article
                        key={attempt.id ?? `${attempt.file_name}-${attempt.created_at}`}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">
                            {formatAttemptType(attempt.attempt_type)}
                          </p>
                          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            {formatStatusValue(meta.status ?? "success")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {formatTimestamp(attempt.created_at)}
                        </p>
                        {displayError ? (
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                            {formatBackendErrorMessage(displayError)}
                          </div>
                        ) : null}
                        {displayIssues.length > 0 ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            {displayIssues.map(formatBackendErrorMessage).join("; ")}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Записи появятся после действий из редактора: публикации,
                  планирования, отмены или переноса.
                </p>
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Журнал ошибок
                </h4>
                <PresenceBadge
                  label={
                    errorJournal.length > 0
                      ? `${errorJournal.length} записей`
                      : "Ошибок нет"
                  }
                  active={errorJournal.length > 0}
                />
              </div>

              {errorJournal.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {errorJournal.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-900">
                          {entry.title}
                        </p>
                        <span className="text-xs uppercase tracking-[0.16em] text-rose-700/70">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-rose-900">
                        {entry.message}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Для этого поста пока не зафиксировано ошибок публикации.
                </p>
              )}

              {latestAttempt ? (
                <p className="mt-4 text-xs uppercase tracking-[0.16em] text-slate-500">
                  Последняя попытка: {formatAttemptType(latestAttempt.attempt_type)} в{" "}
                  {formatTimestamp(latestAttempt.created_at)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
