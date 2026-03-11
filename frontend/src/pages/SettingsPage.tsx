import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../api/client";
import { useToast } from "../components/ToastProvider";
import type { SettingsFormValues } from "../types";

const SECRET_FIELDS = new Set<keyof SettingsFormValues>([
  "telegram_api_id",
  "telegram_api_hash",
  "vk_access_token",
  "image_api_key",
]);

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

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<SettingsFormValues>(EMPTY_FORM);
  const [initialValues, setInitialValues] = useState<SettingsFormValues>(EMPTY_FORM);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
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

  const isDirty = Object.keys(formValues).some((key) => {
    const typedKey = key as keyof SettingsFormValues;
    return formValues[typedKey] !== initialValues[typedKey];
  });

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

    const payload: Partial<SettingsFormValues> = {};
    for (const key of Object.keys(formValues) as Array<keyof SettingsFormValues>) {
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

    if (Object.keys(payload).length === 0) {
      pushToast({
        tone: "warning",
        message: "Нет изменений для сохранения.",
      });
      return;
    }

    await updateMutation.mutateAsync(payload);
  }

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
