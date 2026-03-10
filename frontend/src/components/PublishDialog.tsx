import { useEffect, useState } from "react";

import { PlatformBadge } from "./PlatformBadge";
import { PresenceBadge } from "./PresenceBadge";
import { StatusBadge } from "./StatusBadge";
import type {
  Platform,
  PublishRecord,
  PublishStatus,
  ValidationIssue,
} from "../types";

type PublishMode = "now" | "schedule";
type PublishDialogStep = "review" | "confirm" | "result";

interface PublishDialogProps {
  open: boolean;
  fileName: string;
  platform: Platform;
  currentStatus: PublishStatus;
  scheduledDate: string;
  scheduledTime: string;
  hasUnsavedChanges: boolean;
  validationIssues: ValidationIssue[];
  validationPending: boolean;
  validationErrorMessage: string | null;
  submitPending: boolean;
  result: PublishRecord | null;
  errorMessage: string | null;
  onClose: () => void;
  onResetFeedback: () => void;
  onSubmit: (mode: PublishMode) => void;
}

function validationClasses(level: ValidationIssue["level"]) {
  if (level === "error") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  }
  if (level === "warning") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }
  return "border-sky-400/30 bg-sky-400/10 text-sky-100";
}

function formatSchedule(date: string, time: string) {
  if (!date) {
    return "Date is missing";
  }
  if (!time) {
    return `${date} (time missing)`;
  }
  return `${date} ${time}`;
}

function formatSuccessMessage(result: PublishRecord) {
  const messageId = result.message_id ?? "pending";
  if (result.status === "scheduled") {
    return `Scheduled successfully. Message ID: ${messageId}`;
  }
  return `Published successfully. Message ID: ${messageId}`;
}

export function PublishDialog({
  open,
  fileName,
  platform,
  currentStatus,
  scheduledDate,
  scheduledTime,
  hasUnsavedChanges,
  validationIssues,
  validationPending,
  validationErrorMessage,
  submitPending,
  result,
  errorMessage,
  onClose,
  onResetFeedback,
  onSubmit,
}: PublishDialogProps) {
  const [mode, setMode] = useState<PublishMode>("now");
  const [step, setStep] = useState<PublishDialogStep>("review");

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode("now");
    setStep("review");
  }, [open]);

  useEffect(() => {
    if (result) {
      setStep("result");
    }
  }, [result]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitPending) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, submitPending]);

  if (!open) {
    return null;
  }

  const blockingIssues = validationIssues.filter((issue) => issue.level === "error");
  const nonBlockingIssues = validationIssues.filter((issue) => issue.level !== "error");
  const blockingReasons: string[] = [];

  if (hasUnsavedChanges) {
    blockingReasons.push("Save the draft before publishing or scheduling it.");
  }
  if (!result && currentStatus === "scheduled") {
    blockingReasons.push("This post is already scheduled. Cancel or reschedule it first.");
  }
  if (!result && currentStatus === "published") {
    blockingReasons.push("This post is already marked as published.");
  }
  if (mode === "schedule" && (!scheduledDate || !scheduledTime)) {
    blockingReasons.push("Scheduled publish requires both date and time in the draft.");
  }
  if (validationErrorMessage) {
    blockingReasons.push(validationErrorMessage);
  }
  if (blockingIssues.length > 0) {
    blockingReasons.push(
      `Fix ${blockingIssues.length} blocking validation issue${
        blockingIssues.length === 1 ? "" : "s"
      } before continuing.`,
    );
  }

  const canContinue =
    !validationPending &&
    !submitPending &&
    !result &&
    blockingReasons.length === 0;
  const confirmLabel = mode === "schedule" ? "Schedule publish" : "Publish now";
  const confirmationMessage =
    mode === "schedule"
      ? `The post will be scheduled for ${platform} at ${formatSchedule(
          scheduledDate,
          scheduledTime,
        )}.`
      : `The post will be sent to ${platform} immediately.`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
      data-publish-dialog="true"
      data-publish-mode={mode}
      data-publish-step={step}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-white/10 bg-slate-950 p-6 shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-orange-300/70">
              Publish flow
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Publish or schedule this post
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Review validation, confirm the action, then let the backend
              create or schedule the publication.
            </p>
          </div>

          <button
            type="button"
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
            onClick={onClose}
            disabled={submitPending}
          >
            Close
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatusBadge status={currentStatus} />
          <PlatformBadge platform={platform} />
          <PresenceBadge
            label={hasUnsavedChanges ? "Unsaved changes" : "Saved draft"}
            active={!hasUnsavedChanges}
          />
          <PresenceBadge
            label={validationPending ? "Refreshing validation" : "Validation ready"}
            active={!validationPending}
          />
        </div>

        {result ? (
          <div
            className="mt-5 rounded-2xl border border-teal-400/30 bg-teal-400/10 px-4 py-4 text-sm text-teal-100"
            data-publish-result="success"
          >
            <p className="font-semibold">{formatSuccessMessage(result)}</p>
            <p className="mt-2 text-teal-100/80">
              Status: {result.status}. {result.error ? `Error: ${result.error}` : ""}
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-4 text-sm text-rose-100"
            data-publish-result="error"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            className={[
              "rounded-[28px] border p-5 text-left transition",
              mode === "now"
                ? "border-teal-400/50 bg-teal-400/10"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
            ].join(" ")}
            onClick={() => {
              setMode("now");
              setStep("review");
              onResetFeedback();
            }}
            disabled={submitPending || Boolean(result)}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
              Publish now
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Sends the saved draft immediately using the current platform
              settings.
            </p>
          </button>

          <button
            type="button"
            className={[
              "rounded-[28px] border p-5 text-left transition",
              mode === "schedule"
                ? "border-teal-400/50 bg-teal-400/10"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
            ].join(" ")}
            onClick={() => {
              setMode("schedule");
              setStep("review");
              onResetFeedback();
            }}
            disabled={submitPending || Boolean(result)}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
              Schedule
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Uses the saved draft date and time when creating the scheduled
              publish record.
            </p>
          </button>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Action summary
              </h4>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    File
                  </p>
                  <p className="mt-2 text-sm text-slate-100">{fileName}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Mode
                  </p>
                  <p className="mt-2 text-sm text-slate-100">
                    {mode === "schedule" ? "Schedule publish" : "Immediate publish"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Target slot
                  </p>
                  <p className="mt-2 text-sm text-slate-100">
                    {mode === "schedule"
                      ? formatSchedule(scheduledDate, scheduledTime)
                      : "As soon as the request is confirmed"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Validation check
                </h4>
                <span className="text-sm text-slate-500">
                  {validationIssues.length} issues
                </span>
              </div>

              {validationPending ? (
                <p className="mt-4 text-sm text-slate-400">
                  Refreshing validation against the saved target platform...
                </p>
              ) : null}

              {!validationPending && validationErrorMessage ? (
                <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {validationErrorMessage}
                </div>
              ) : null}

              {!validationPending &&
              !validationErrorMessage &&
              validationIssues.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">
                  No validation issues for the current draft.
                </p>
              ) : null}

              {!validationPending &&
              !validationErrorMessage &&
              validationIssues.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {validationIssues.map((issue) => (
                    <article
                      key={`${issue.level}-${issue.code}`}
                      className={[
                        "rounded-2xl border px-4 py-3 text-sm",
                        validationClasses(issue.level),
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold uppercase tracking-[0.14em]">
                          {issue.level}
                        </span>
                        <span className="text-xs uppercase tracking-[0.14em] opacity-70">
                          {issue.code}
                        </span>
                      </div>
                      <p className="mt-2 leading-6">{issue.message}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Blocking conditions
              </h4>

              {blockingReasons.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {blockingReasons.map((reason) => (
                    <div
                      key={reason}
                      className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">
                  No blocking conditions. Warnings remain visible but will not
                  stop publishing.
                </p>
              )}

              {nonBlockingIssues.length > 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Non-blocking warnings and info stay visible for operator
                  review.
                </p>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Confirmation
              </h4>

              {step === "review" ? (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Review the validation state, then continue to the confirmation
                  step before the backend request is sent.
                </p>
              ) : null}

              {step === "confirm" ? (
                <div className="mt-4 rounded-2xl border border-teal-400/25 bg-teal-400/10 px-4 py-4 text-sm leading-6 text-teal-100">
                  {confirmationMessage}
                </div>
              ) : null}

              {step === "result" && result ? (
                <div className="mt-4 rounded-2xl border border-teal-400/25 bg-teal-400/10 px-4 py-4 text-sm leading-6 text-teal-100">
                  {formatSuccessMessage(result)}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                {step === "review" ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                      onClick={onClose}
                      disabled={submitPending}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      onClick={() => {
                        onResetFeedback();
                        setStep("confirm");
                      }}
                      disabled={!canContinue}
                    >
                      Continue
                    </button>
                  </>
                ) : null}

                {step === "confirm" ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      onClick={() => {
                        onResetFeedback();
                        setStep("review");
                      }}
                      disabled={submitPending}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      data-publish-submit="true"
                      className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      onClick={() => onSubmit(mode)}
                      disabled={!canContinue || submitPending}
                    >
                      {submitPending
                        ? mode === "schedule"
                          ? "Scheduling..."
                          : "Publishing..."
                        : confirmLabel}
                    </button>
                  </>
                ) : null}

                {step === "result" ? (
                  <button
                    type="button"
                    className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
                    onClick={onClose}
                  >
                    Close
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
