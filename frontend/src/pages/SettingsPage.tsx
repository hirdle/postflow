import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../api/client";
import { useToast } from "../components/ToastProvider";
import type {
  SettingsFormValues,
  TelegramSessionState,
  TelegramSessionStatus,
} from "../types";

const SECRET_FIELDS = new Set<keyof SettingsFormValues>([
  "telegram_api_id",
  "telegram_api_hash",
  "vk_access_token",
  "image_api_key",
]);
const TELEGRAM_SETTINGS_FIELDS: Array<keyof SettingsFormValues> = [
  "telegram_api_id",
  "telegram_api_hash",
  "telegram_session_path",
  "telegram_channel",
];
const ACTIVE_TELEGRAM_SESSION_STATUSES = new Set<TelegramSessionStatus>([
  "waiting_for_scan",
  "password_required",
]);
const FINAL_TELEGRAM_SESSION_STATUSES = new Set<TelegramSessionStatus>([
  "authorized",
  "expired",
  "failed",
  "cancelled",
]);
const TELEGRAM_SESSION_STORAGE_KEY = "postflow:telegram-session-id";

const EMPTY_FORM: SettingsFormValues = {
  telegram_api_id: "",
  telegram_api_hash: "",
  telegram_session_path: "",
  telegram_channel: "",
  vk_access_token: "",
  vk_group_id: "",
  image_api_key: "",
  image_base_url: "",
  image_default_model: "",
};

const SECTION_FIELDS: Array<{
  title: string;
  description: string;
  fields: Array<{
    key: keyof SettingsFormValues;
    label: string;
    placeholder: string;
    secret?: boolean;
  }>;
}> = [
  {
    title: "Telegram",
    description: "Авторизация и маршрут публикации для Telethon-клиента.",
    fields: [
      {
        key: "telegram_api_id",
        label: "API ID",
        placeholder: "123456",
        secret: true,
      },
      {
        key: "telegram_api_hash",
        label: "API Hash",
        placeholder: "abcdef123456",
        secret: true,
      },
      {
        key: "telegram_session_path",
        label: "Путь к сессии",
        placeholder: "data/biovolt",
      },
      {
        key: "telegram_channel",
        label: "Канал",
        placeholder: "@biovoltru_channel",
      },
    ],
  },
  {
    title: "VK",
    description: "Доступ к публикациям на стене и к настройкам группы.",
    fields: [
      {
        key: "vk_access_token",
        label: "Токен доступа",
        placeholder: "vk1.a....",
        secret: true,
      },
      {
        key: "vk_group_id",
        label: "ID группы",
        placeholder: "123456",
      },
    ],
  },
  {
    title: "Генерация изображений",
    description: "Параметры внешнего сервиса генерации изображений.",
    fields: [
      {
        key: "image_api_key",
        label: "API-ключ",
        placeholder: "sk-...",
        secret: true,
      },
      {
        key: "image_base_url",
        label: "Базовый URL",
        placeholder: "https://api.hydraai.ru/v1/",
      },
      {
        key: "image_default_model",
        label: "Модель по умолчанию",
        placeholder: "hydra-banana",
      },
    ],
  },
];

function normalizeSettings(values: Partial<SettingsFormValues> | undefined) {
  const normalized = { ...EMPTY_FORM };

  for (const key of Object.keys(EMPTY_FORM) as Array<keyof SettingsFormValues>) {
    const candidate = values?.[key];
    normalized[key] = typeof candidate === "string" ? candidate : "";
  }

  return normalized;
}

function buildSettingsPayload(
  formValues: SettingsFormValues,
  initialValues: SettingsFormValues,
  keys: Array<keyof SettingsFormValues> = Object.keys(
    EMPTY_FORM,
  ) as Array<keyof SettingsFormValues>,
) {
  const payload: Partial<SettingsFormValues> = {};

  for (const key of keys) {
    const nextValue = formValues[key];
    const initialValue = initialValues[key];
    if (nextValue === initialValue) {
      continue;
    }
    if (nextValue.trim() === "") {
      continue;
    }
    if (
      SECRET_FIELDS.has(key) &&
      initialValue.includes("***") &&
      nextValue === initialValue
    ) {
      continue;
    }
    payload[key] = nextValue;
  }

  return payload;
}

function readStoredTelegramSessionId() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(TELEGRAM_SESSION_STORAGE_KEY);
}

function writeStoredTelegramSessionId(sessionId: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (sessionId) {
    window.sessionStorage.setItem(TELEGRAM_SESSION_STORAGE_KEY, sessionId);
    return;
  }
  window.sessionStorage.removeItem(TELEGRAM_SESSION_STORAGE_KEY);
}

function formatTelegramSessionStatus(status: TelegramSessionStatus | null | undefined) {
  switch (status) {
    case "waiting_for_scan":
      return "Ждем сканирования QR";
    case "password_required":
      return "Нужен пароль 2FA";
    case "authorized":
      return "Сессия авторизована";
    case "expired":
      return "QR-код истек";
    case "failed":
      return "Инициализация не удалась";
    case "cancelled":
      return "Сессия отменена";
    default:
      return "Сессия не запущена";
  }
}

function describeTelegramSession(session: TelegramSessionState | null) {
  if (!session) {
    return "Сохраните Telegram API ID/API Hash и запустите QR-логин. Session file будет создан на backend и использован Telethon-публикатором.";
  }
  switch (session.status) {
    case "waiting_for_scan":
      return "Откройте Telegram на телефоне: Settings -> Devices -> Link Desktop Device, затем отсканируйте QR-код.";
    case "password_required":
      return "Сканирование завершено. Telegram запросил пароль двухфакторной аутентификации для завершения входа.";
    case "authorized":
      return "Сессия уже сохранена. Публикация в Telegram может использовать этот session file без отдельного terminal-only helper.";
    case "expired":
      return "Код перестал быть валидным до завершения входа. Запустите QR-логин еще раз.";
    case "failed":
      return "Backend не смог завершить авторизацию. Проверьте детали ошибки и повторите инициализацию.";
    case "cancelled":
      return "Текущий QR-flow остановлен. При необходимости можно запустить новый.";
    default:
      return "";
  }
}

function telegramSessionToneClasses(status: TelegramSessionStatus | null | undefined) {
  if (status === "authorized") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "password_required") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (status === "expired" || status === "failed" || status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-cyan-200 bg-cyan-50 text-cyan-900";
}

function formatSessionTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<SettingsFormValues>(EMPTY_FORM);
  const [initialValues, setInitialValues] = useState<SettingsFormValues>(EMPTY_FORM);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [telegramSessionId, setTelegramSessionId] = useState<string | null>(() =>
    readStoredTelegramSessionId(),
  );
  const [telegramPassword, setTelegramPassword] = useState("");
  const { pushToast } = useToast();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingsFormValues>("/settings"),
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    const normalized = normalizeSettings(settingsQuery.data);
    setFormValues(normalized);
    setInitialValues(normalized);
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<SettingsFormValues>) =>
      apiFetch<SettingsFormValues>("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      const normalized = normalizeSettings(data);
      queryClient.setQueryData(["settings"], normalized);
      setFormValues(normalized);
      setInitialValues(normalized);
      pushToast({
        tone: "success",
        message: "Настройки сохранены и перечитаны из бэкенда.",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Не удалось сохранить настройки.";
      pushToast({ tone: "error", message });
    },
  });

  const telegramSessionQuery = useQuery({
    queryKey: ["telegram-session", telegramSessionId],
    enabled: Boolean(telegramSessionId),
    queryFn: () =>
      apiFetch<TelegramSessionState>(`/settings/telegram/session/${telegramSessionId}`),
    retry: false,
    refetchInterval: (query) => {
      const session = query.state.data as TelegramSessionState | undefined;
      if (!session) {
        return 2500;
      }
      return ACTIVE_TELEGRAM_SESSION_STATUSES.has(session.status) ? 2500 : false;
    },
  });

  function activateTelegramSession(session: TelegramSessionState) {
    setTelegramSessionId(session.session_id);
    queryClient.setQueryData(["telegram-session", session.session_id], session);
  }

  async function persistTelegramSettingsIfNeeded() {
    const payload = buildSettingsPayload(
      formValues,
      initialValues,
      TELEGRAM_SETTINGS_FIELDS,
    );

    if (Object.keys(payload).length === 0) {
      return;
    }

    await updateMutation.mutateAsync(payload);
  }

  const startTelegramSessionMutation = useMutation({
    mutationFn: async () => {
      await persistTelegramSettingsIfNeeded();
      return apiFetch<TelegramSessionState>("/settings/telegram/session", {
        method: "POST",
      });
    },
    onSuccess: (session) => {
      activateTelegramSession(session);
      setTelegramPassword("");
      pushToast({
        tone: "success",
        message:
          session.status === "authorized"
            ? "Telegram-сессия уже была авторизована."
            : "QR-логин запущен. Отсканируйте код в Telegram.",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось запустить Telegram QR-логин.";
      pushToast({ tone: "error", message });
    },
  });

  const submitTelegramPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!telegramSessionId) {
        throw new Error("Нет активной Telegram-сессии.");
      }
      return apiFetch<TelegramSessionState>(
        `/settings/telegram/session/${telegramSessionId}/password`,
        {
          method: "POST",
          body: JSON.stringify({ password: telegramPassword }),
        },
      );
    },
    onSuccess: (session) => {
      activateTelegramSession(session);
      setTelegramPassword("");
      pushToast({
        tone: "success",
        message: "Telegram-сессия авторизована и сохранена.",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Не удалось отправить 2FA-пароль.";
      pushToast({ tone: "error", message });
    },
  });

  const cancelTelegramSessionMutation = useMutation({
    mutationFn: async () => {
      if (!telegramSessionId) {
        throw new Error("Нет активной Telegram-сессии.");
      }
      return apiFetch<TelegramSessionState>(
        `/settings/telegram/session/${telegramSessionId}`,
        {
          method: "DELETE",
        },
      );
    },
    onSuccess: (session) => {
      activateTelegramSession(session);
      setTelegramPassword("");
      pushToast({
        tone: "warning",
        message: "Telegram QR-flow остановлен.",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось остановить Telegram-сессию.";
      pushToast({ tone: "error", message });
    },
  });

  const isDirty = Object.keys(formValues).some((key) => {
    const typedKey = key as keyof SettingsFormValues;
    return formValues[typedKey] !== initialValues[typedKey];
  });
  const isTelegramDirty = TELEGRAM_SETTINGS_FIELDS.some(
    (key) => formValues[key] !== initialValues[key],
  );
  const telegramSession = telegramSessionId
    ? (telegramSessionQuery.data ?? null)
    : null;
  const telegramQrExpiresAt = formatSessionTimestamp(
    telegramSession?.expires_at ?? null,
  );
  const isTelegramSessionActive =
    telegramSession !== null &&
    ACTIVE_TELEGRAM_SESSION_STATUSES.has(telegramSession.status);
  const isTelegramActionPending =
    startTelegramSessionMutation.isPending ||
    submitTelegramPasswordMutation.isPending ||
    cancelTelegramSessionMutation.isPending;

  function setFieldValue(key: keyof SettingsFormValues, value: string) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleVisibility(key: keyof SettingsFormValues) {
    setVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildSettingsPayload(formValues, initialValues);

    if (Object.keys(payload).length === 0) {
      pushToast({
        tone: "warning",
        message: "Нет изменений для сохранения.",
      });
      return;
    }

    await updateMutation.mutateAsync(payload);
  }

  useEffect(() => {
    if (!telegramSessionId) {
      writeStoredTelegramSessionId(null);
      return;
    }

    if (!telegramSession) {
      writeStoredTelegramSessionId(telegramSessionId);
      return;
    }

    if (FINAL_TELEGRAM_SESSION_STATUSES.has(telegramSession.status)) {
      writeStoredTelegramSessionId(null);
      return;
    }

    writeStoredTelegramSessionId(telegramSession.session_id);
  }, [telegramSession, telegramSessionId]);

  useEffect(() => {
    if (!telegramSessionQuery.error || !telegramSessionId) {
      return;
    }

    setTelegramSessionId(null);
    setTelegramPassword("");
    writeStoredTelegramSessionId(null);
    pushToast({
      tone: "warning",
      message:
        "Backend не нашел активный Telegram QR-flow. Запустите инициализацию снова.",
    });
  }, [pushToast, telegramSessionId, telegramSessionQuery.error]);

  useEffect(() => {
    if (telegramSession?.status !== "password_required") {
      setTelegramPassword("");
    }
  }, [telegramSession?.status]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-teal-50 p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.24em] text-teal-700/70">
          Настройки
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Доступы и конфигурация API
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Страница подключена к `GET/PUT /api/settings`. Секреты приходят в
          маскированном виде, а сохранение отправляет только реально измененные
          значения.
        </p>
      </section>

      {settingsQuery.isLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-600 shadow-sm">
          Загружаем настройки из бэкенда…
        </section>
      ) : null}

      {settingsQuery.isError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm">
          Не удалось загрузить настройки. Обновите страницу после восстановления
          бэкенда.
        </section>
      ) : null}

      {!settingsQuery.isLoading && !settingsQuery.isError ? (
        <form className="space-y-6" onSubmit={handleSubmit}>
          {SECTION_FIELDS.map((section) => (
            <section
              key={section.title}
              className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm"
            >
              <div className="border-b border-slate-200 pb-4">
                <h3 className="text-xl font-semibold text-slate-950">
                  {section.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {section.description}
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {section.fields.map((field) => {
                  const isSecret = Boolean(field.secret);
                  const isVisible = visibility[field.key] ?? false;
                  return (
                    <label
                      key={field.key}
                      className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {field.label}
                      </span>

                      <div className="flex gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
                          type={isSecret && !isVisible ? "password" : "text"}
                          value={formValues[field.key]}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setFieldValue(field.key, event.target.value)
                          }
                        />

                        {isSecret ? (
                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            onClick={() => toggleVisibility(field.key)}
                          >
                            {isVisible ? "Скрыть" : "Показать"}
                          </button>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>

              {section.title === "Telegram" ? (
                <div className="mt-6 rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.25)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-teal-200/80">
                        Telegram Session
                      </p>
                      <h4 className="mt-2 text-xl font-semibold">
                        QR-инициализация Telethon-сессии
                      </h4>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                        {describeTelegramSession(telegramSession)}
                      </p>
                      {isTelegramDirty ? (
                        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-amber-200">
                          Перед запуском будут сохранены измененные Telegram-поля.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                        disabled={
                          settingsQuery.isLoading ||
                          updateMutation.isPending ||
                          isTelegramActionPending ||
                          isTelegramSessionActive
                        }
                        onClick={() => {
                          void startTelegramSessionMutation.mutateAsync();
                        }}
                      >
                        {startTelegramSessionMutation.isPending
                          ? "Запускаем…"
                          : telegramSession
                            ? "Перезапустить QR-логин"
                            : "Запустить QR-логин"}
                      </button>

                      {telegramSession ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-400"
                          disabled={
                            !isTelegramSessionActive || cancelTelegramSessionMutation.isPending
                          }
                          onClick={() => {
                            void cancelTelegramSessionMutation.mutateAsync();
                          }}
                        >
                          {cancelTelegramSessionMutation.isPending
                            ? "Останавливаем…"
                            : "Остановить flow"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_320px]">
                    <div className="space-y-4">
                      <div
                        className={[
                          "rounded-3xl border px-4 py-4 shadow-sm",
                          telegramSessionToneClasses(telegramSession?.status),
                        ].join(" ")}
                      >
                        <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                          Статус
                        </p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatTelegramSessionStatus(telegramSession?.status)}
                        </p>

                        {telegramSession?.account_label ? (
                          <p className="mt-2 text-sm leading-6">
                            Авторизованный аккаунт:{" "}
                            <span className="font-semibold">
                              {telegramSession.account_label}
                            </span>
                          </p>
                        ) : null}

                        {telegramQrExpiresAt ? (
                          <p className="mt-2 text-sm leading-6">
                            QR-код истекает:{" "}
                            <span className="font-semibold">
                              {telegramQrExpiresAt}
                            </span>
                          </p>
                        ) : null}

                        {telegramSessionQuery.isFetching && telegramSessionId ? (
                          <p className="mt-2 text-sm leading-6 opacity-80">
                            Перечитываем статус из backend…
                          </p>
                        ) : null}

                        {telegramSession?.error ? (
                          <p className="mt-3 rounded-2xl border border-current/15 bg-white/60 px-3 py-3 text-sm leading-6">
                            {telegramSession.error}
                          </p>
                        ) : null}
                      </div>

                      {telegramSession?.status === "password_required" ? (
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm font-medium text-white">
                            Завершение входа через 2FA
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            После сканирования Telegram запросил пароль. Он не
                            сохраняется во frontend и уходит только в текущий
                            backend flow.
                          </p>

                          <div className="mt-4 flex flex-col gap-3 md:flex-row">
                            <input
                              className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400"
                              type="password"
                              value={telegramPassword}
                              placeholder="Пароль двухфакторной аутентификации"
                              onChange={(event) =>
                                setTelegramPassword(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") {
                                  return;
                                }
                                event.preventDefault();
                                void submitTelegramPasswordMutation.mutateAsync();
                              }}
                            />

                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-300"
                              disabled={
                                telegramPassword.trim().length === 0 ||
                                submitTelegramPasswordMutation.isPending
                              }
                              onClick={() => {
                                void submitTelegramPasswordMutation.mutateAsync();
                              }}
                            >
                              {submitTelegramPasswordMutation.isPending
                                ? "Проверяем…"
                                : "Подтвердить пароль"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                          Session path берется из сохраненных backend-настроек.
                          Если QR-код не был отсканирован до{" "}
                          {telegramQrExpiresAt ?? "истечения TTL"}, запустите flow
                          повторно.
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/95 p-4 shadow-sm">
                      {telegramSession?.qr_image_data_url ? (
                        <div className="space-y-3">
                          <img
                            src={telegramSession.qr_image_data_url}
                            alt="Telegram QR"
                            className="mx-auto w-full max-w-[280px] rounded-2xl border border-slate-200 bg-white p-3"
                          />
                          <p className="text-center text-sm leading-6 text-slate-600">
                            Отсканируйте QR в Telegram, чтобы связать текущий
                            session file с аккаунтом.
                          </p>
                        </div>
                      ) : (
                        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
                          <p className="text-sm font-medium text-slate-700">
                            QR-код появится здесь
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            После запуска backend создаст временный auth flow и
                            вернет изображение для сканирования.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ))}

          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50/90 p-5 md:flex-row md:items-center md:justify-between shadow-sm">
            <p className="text-sm text-slate-600">
              {isDirty
                ? "Есть несохраненные изменения."
                : "Все настройки синхронизированы."}
            </p>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              disabled={!isDirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Сохраняем…" : "Сохранить настройки"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
