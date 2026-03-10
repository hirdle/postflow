import { PlatformBadge } from "./PlatformBadge";
import { PresenceBadge } from "./PresenceBadge";
import { StatusBadge } from "./StatusBadge";
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
  if (!value) {
    return "Timestamp unavailable";
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

function formatSchedule(record: PublishRecord) {
  if (!record.scheduled_date) {
    return null;
  }

  if (!record.scheduled_time) {
    return record.scheduled_date;
  }

  return `${record.scheduled_date} ${record.scheduled_time}`;
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
    .filter((record) => record.error)
    .map((record) => ({
      id: `record-${record.id ?? record.created_at ?? record.file_name}`,
      title: `${record.platform} ${record.status}`,
      message: record.error ?? "",
      timestamp: record.published_at ?? record.created_at,
    }));

  const attemptErrors = publishAttempts
    .map((attempt) => ({
      attempt,
      meta: parseAttemptMeta(attempt),
    }))
    .filter(({ meta }) => meta.error || meta.issues.length > 0)
    .map(({ attempt, meta }) => ({
      id: `attempt-${attempt.id ?? attempt.created_at ?? attempt.file_name}`,
      title: `${attempt.attempt_type} ${meta.status ?? "failure"}`,
      message: meta.error ?? meta.issues.join("; "),
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
      className="rounded-3xl border border-white/10 bg-white/5 p-6"
      data-publication-status-section="true"
      data-publication-records-count={publishRecords.length}
      data-publication-attempts-count={publishAttempts.length}
    >
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">
            Publication status
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Latest publish state, history records and attempt journal from the
            backend repository.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge status={status} />
          <PresenceBadge
            label={`${publishRecords.length} records`}
            active={publishRecords.length > 0}
          />
          <PresenceBadge
            label={`${publishAttempts.length} attempts`}
            active={publishAttempts.length > 0}
          />
        </div>
      </div>

      {!fileName ? (
        <p className="mt-5 text-sm text-slate-400">
          Save the draft first. Publication history starts once the post has a
          stable filename and publish activity in SQLite.
        </p>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Current state
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {latestRecord
                      ? "Backend current state is derived from the newest publish record."
                      : "No publish record exists yet for this post."}
                  </p>
                </div>
                {latestRecord ? (
                  <PlatformBadge platform={latestRecord.platform} />
                ) : null}
              </div>

              {latestRecord ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Latest event
                    </p>
                    <p className="mt-2 text-sm text-slate-100">
                      {formatTimestamp(
                        latestRecord.published_at ?? latestRecord.created_at,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Target slot
                    </p>
                    <p className="mt-2 text-sm text-slate-100">
                      {formatSchedule(latestRecord) ?? "Publish immediately"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Message ID
                    </p>
                    <p className="mt-2 text-sm text-slate-100">
                      {latestRecord.message_id ?? "Not stored"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Poll message ID
                    </p>
                    <p className="mt-2 text-sm text-slate-100">
                      {latestRecord.poll_message_id ?? "No poll"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Publish history
                </h4>
                <span className="text-sm text-slate-500">
                  {publishRecords.length} records
                </span>
              </div>

              {publishRecords.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {publishRecords.map((record) => (
                    <article
                      key={record.id ?? `${record.file_name}-${record.created_at}`}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={record.status} />
                        <PlatformBadge platform={record.platform} />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Timestamp
                          </p>
                          <p className="mt-1 text-sm text-slate-100">
                            {formatTimestamp(
                              record.published_at ?? record.created_at,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Schedule
                          </p>
                          <p className="mt-1 text-sm text-slate-100">
                            {formatSchedule(record) ?? "Immediate publish"}
                          </p>
                        </div>
                      </div>
                      {record.error ? (
                        <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                          {record.error}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">
                  No publish records yet. The section will populate after the
                  first publish, schedule, cancel or failure event.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Attempts journal
                </h4>
                <span className="text-sm text-slate-500">
                  {publishAttempts.length} attempts
                </span>
              </div>

              {publishAttempts.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {publishAttempts.map((attempt) => {
                    const meta = parseAttemptMeta(attempt);

                    return (
                      <article
                        key={attempt.id ?? `${attempt.file_name}-${attempt.created_at}`}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-200">
                            {attempt.attempt_type}
                          </p>
                          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            {meta.status ?? "logged"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">
                          {formatTimestamp(attempt.created_at)}
                        </p>
                        {meta.error ? (
                          <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                            {meta.error}
                          </div>
                        ) : null}
                        {meta.issues.length > 0 ? (
                          <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                            {meta.issues.join("; ")}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">
                  Attempt entries are empty until the editor triggers publish or
                  schedule actions.
                </p>
              )}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Error journal
                </h4>
                <PresenceBadge
                  label={
                    errorJournal.length > 0
                      ? `${errorJournal.length} entries`
                      : "No errors"
                  }
                  active={errorJournal.length > 0}
                />
              </div>

              {errorJournal.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {errorJournal.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-50">
                          {entry.title}
                        </p>
                        <span className="text-xs uppercase tracking-[0.16em] text-rose-100/70">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-rose-100">
                        {entry.message}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">
                  No recorded publication errors for this post yet.
                </p>
              )}

              {latestAttempt ? (
                <p className="mt-4 text-xs uppercase tracking-[0.16em] text-slate-500">
                  Latest attempt: {latestAttempt.attempt_type} at{" "}
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
