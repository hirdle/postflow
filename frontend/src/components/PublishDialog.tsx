import { useEffect, useState } from "react";

import { PlatformBadge } from "./PlatformBadge";
import { PresenceBadge } from "./PresenceBadge";
import { StatusBadge } from "./StatusBadge";
import { formatScheduleValue } from "../lib/format";
import { formatValidationIssueMessage } from "../lib/validation";
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
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (level === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function formatSchedule(date: string, time: string) {
  return formatScheduleValue(date, time, "Дата не указана");
}

function formatSuccessMessage(result: PublishRecord) {
  const messageId = result.message_id ?? "ожидается";
  if (result.status === "scheduled") {
    return `Пост поставлен в очередь. ID сообщения: ${messageId}`;
  }
  return `Пост опубликован. ID сообщения: ${messageId}`;
}

function platformLabel(platform: Platform) {
  return platform === "telegram" ? "Telegram" : "VK";
}

function publishStatusLabel(status: PublishStatus) {
  if (status === "draft") {
    return "черновик";
  }
  if (status === "scheduled") {
    return "запланирован";
  }
  if (status === "published") {
    return "опубликован";
  }
  if (status === "failed") {
    return "ошибка";
  }
  return "отменен";
}

function validationLevelLabel(level: ValidationIssue["level"]) {
  if (level === "error") {
    return "Ошибка";
  }
  if (level === "warning") {
    return "Предупреждение";
  }
  return "Инфо";
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
    blockingReasons.push("Сначала сохраните черновик.");
  }
  if (!result && currentStatus === "scheduled") {
    blockingReasons.push(
      "Пост уже стоит в очереди. Сначала отмените или перенесите текущий слот.",
    );
  }
  if (!result && currentStatus === "published") {
    blockingReasons.push("Пост уже отмечен как опубликованный.");
  }
  if (mode === "schedule" && (!scheduledDate || !scheduledTime)) {
    blockingReasons.push("Для планирования нужны и дата, и время в черновике.");
  }
  if (validationErrorMessage) {
    blockingReasons.push(validationErrorMessage);
  }
  if (errorMessage) {
    blockingReasons.push("Исправьте последнюю ошибку публикации перед повторной попыткой.");
  }
  if (blockingIssues.length > 0) {
    blockingReasons.push(
      `Исправьте ${blockingIssues.length} блокирующих проблем перед продолжением.`,
    );
  }

  const canContinue =
    !validationPending &&
    !submitPending &&
    !result &&
    blockingReasons.length === 0;
  const confirmLabel = mode === "schedule" ? "Запланировать" : "Опубликовать";
  const confirmationMessage =
    mode === "schedule"
      ? `Пост будет запланирован для ${platformLabel(platform)} на ${formatSchedule(
          scheduledDate,
          scheduledTime,
        )}.`
      : `Пост будет сразу отправлен в ${platformLabel(platform)}.`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm"
      data-publish-dialog="true"
      data-publish-mode={mode}
      data-publish-step={step}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-orange-700/70">
              Публикация
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">
              Опубликовать или поставить пост в очередь
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Проверьте валидацию, подтвердите действие и позвольте бэкенду
              создать публикацию или слот расписания.
            </p>
          </div>

          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            onClick={onClose}
            disabled={submitPending}
          >
            Закрыть
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatusBadge status={currentStatus} />
          <PlatformBadge platform={platform} />
          <PresenceBadge
            label={hasUnsavedChanges ? "Есть изменения" : "Черновик сохранен"}
            active={!hasUnsavedChanges}
          />
          <PresenceBadge
            label={validationPending ? "Обновляем валидацию" : "Валидация готова"}
            active={!validationPending}
          />
        </div>

        {result ? (
          <div
            className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-900"
            data-publish-result="success"
          >
            <p className="font-semibold">{formatSuccessMessage(result)}</p>
            <p className="mt-2 text-teal-800/80">
              Статус: {publishStatusLabel(result.status)}.{" "}
              {result.error ? `Ошибка: ${result.error}` : ""}
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900"
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
                ? "border-teal-300 bg-teal-50"
                : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
            ].join(" ")}
            onClick={() => {
              setMode("now");
              setStep("review");
              onResetFeedback();
            }}
            disabled={submitPending || Boolean(result)}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
              Опубликовать сейчас
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Отправляет сохраненный черновик сразу с текущими настройками
              платформы.
            </p>
          </button>

          <button
            type="button"
            className={[
              "rounded-[28px] border p-5 text-left transition",
              mode === "schedule"
                ? "border-teal-300 bg-teal-50"
                : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
            ].join(" ")}
            onClick={() => {
              setMode("schedule");
              setStep("review");
              onResetFeedback();
            }}
            disabled={submitPending || Boolean(result)}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
              Запланировать
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Использует дату и время из сохраненного черновика для создания
              записи в расписании.
            </p>
          </button>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                Сводка действия
              </h4>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Файл
                  </p>
                  <p className="mt-2 text-sm text-slate-900">{fileName}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Режим
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {mode === "schedule"
                      ? "Отложенная публикация"
                      : "Немедленная публикация"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Целевой слот
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {mode === "schedule"
                      ? formatSchedule(scheduledDate, scheduledTime)
                      : "Сразу после подтверждения"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Проверка валидации
                </h4>
                <span className="text-sm text-slate-500">
                  {validationIssues.length} замечаний
                </span>
              </div>

              {validationPending ? (
                <p className="mt-4 text-sm text-slate-500">
                  Обновляем валидацию под текущую целевую платформу…
                </p>
              ) : null}

              {!validationPending && validationErrorMessage ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {validationErrorMessage}
                </div>
              ) : null}

              {!validationPending &&
              !validationErrorMessage &&
              validationIssues.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Для текущего черновика нет замечаний по валидации.
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
                          {validationLevelLabel(issue.level)}
                        </span>
                        <span className="text-xs uppercase tracking-[0.14em] opacity-70">
                          {issue.code}
                        </span>
                      </div>
                      <p className="mt-2 leading-6">
                        {formatValidationIssueMessage(issue)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                Блокирующие условия
              </h4>

              {blockingReasons.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {blockingReasons.map((reason) => (
                    <div
                      key={reason}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Блокирующих условий нет. Предупреждения останутся видимыми, но
                  не остановят публикацию.
                </p>
              )}

              {nonBlockingIssues.length > 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Неблокирующие предупреждения и инфо остаются видимыми для
                  ручной проверки.
                </p>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                Подтверждение
              </h4>

              {step === "review" ? (
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Проверьте валидацию и только потом переходите к подтверждению
                  запроса в бэкенд.
                </p>
              ) : null}

              {step === "confirm" ? (
                <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm leading-6 text-teal-900">
                  {confirmationMessage}
                </div>
              ) : null}

              {step === "result" && result ? (
                <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm leading-6 text-teal-900">
                  {formatSuccessMessage(result)}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                {step === "review" ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                      onClick={onClose}
                      disabled={submitPending}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                      onClick={() => {
                        onResetFeedback();
                        setStep("confirm");
                      }}
                      disabled={!canContinue}
                    >
                      Продолжить
                    </button>
                  </>
                ) : null}

                {step === "confirm" ? (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:text-slate-400"
                      onClick={() => {
                        onResetFeedback();
                        setStep("review");
                      }}
                      disabled={submitPending}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      data-publish-submit="true"
                      className="rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                      onClick={() => onSubmit(mode)}
                      disabled={!canContinue || submitPending}
                    >
                      {submitPending
                        ? mode === "schedule"
                          ? "Планируем…"
                          : "Публикуем…"
                        : confirmLabel}
                    </button>
                  </>
                ) : null}

                {step === "result" ? (
                  <button
                    type="button"
                    className="rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500"
                    onClick={onClose}
                  >
                    Закрыть
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
