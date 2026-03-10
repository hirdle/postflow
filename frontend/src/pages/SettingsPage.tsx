import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../api/client";
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
    description: "Авторизация и channel routing для Telethon publisher.",
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
        label: "Session Path",
        placeholder: "data/biovolt",
      },
      {
        key: "telegram_channel",
        label: "Channel",
        placeholder: "@biovoltru_channel",
      },
    ],
  },
  {
    title: "VK",
    description: "Доступ к VK wall publishing и group targeting.",
    fields: [
      {
        key: "vk_access_token",
        label: "Access Token",
        placeholder: "vk1.a....",
        secret: true,
      },
      {
        key: "vk_group_id",
        label: "Group ID",
        placeholder: "123456",
      },
    ],
  },
  {
    title: "Image API",
    description: "Параметры внешнего image generation endpoint.",
    fields: [
      {
        key: "image_api_key",
        label: "API Key",
        placeholder: "sk-...",
        secret: true,
      },
      {
        key: "image_base_url",
        label: "Base URL",
        placeholder: "https://api.hydraai.ru/v1/",
      },
      {
        key: "image_default_model",
        label: "Default Model",
        placeholder: "hydra-banana",
      },
    ],
  },
];

type ToastState =
  | { tone: "success" | "error"; message: string }
  | null;

function normalizeSettings(values: Partial<SettingsFormValues> | undefined) {
  return {
    ...EMPTY_FORM,
    ...values,
  };
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<SettingsFormValues>(EMPTY_FORM);
  const [initialValues, setInitialValues] = useState<SettingsFormValues>(EMPTY_FORM);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<ToastState>(null);

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
      setToast({
        tone: "success",
        message: "Settings saved and reloaded from backend.",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Unknown settings save error.";
      setToast({ tone: "error", message });
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
    if (toast) {
      setToast(null);
    }
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
      setToast({
        tone: "success",
        message: "No changed settings to save.",
      });
      return;
    }

    await updateMutation.mutateAsync(payload);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/8 to-transparent p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-teal-300/70">
          Settings
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Credentials and API configuration
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Страница подключена к backend `GET/PUT /api/settings`. Secret fields
          приходят masked, а сохранение отправляет только реально изменённые
          значения.
        </p>
      </section>

      {toast ? (
        <div
          className={[
            "rounded-2xl border px-4 py-3 text-sm",
            toast.tone === "success"
              ? "border-teal-400/30 bg-teal-400/10 text-teal-100"
              : "border-rose-400/30 bg-rose-400/10 text-rose-100",
          ].join(" ")}
        >
          {toast.message}
        </div>
      ) : null}

      {settingsQuery.isLoading ? (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">
          Loading settings from backend...
        </section>
      ) : null}

      {settingsQuery.isError ? (
        <section className="rounded-3xl border border-rose-400/30 bg-rose-400/10 p-6 text-rose-100">
          Failed to load settings. Refresh the page after backend recovery.
        </section>
      ) : null}

      {!settingsQuery.isLoading && !settingsQuery.isError ? (
        <form className="space-y-6" onSubmit={handleSubmit}>
          {SECTION_FIELDS.map((section) => (
            <section
              key={section.title}
              className="rounded-3xl border border-white/10 bg-white/5 p-6"
            >
              <div className="border-b border-white/10 pb-4">
                <h3 className="text-xl font-semibold text-white">
                  {section.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
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
                      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    >
                      <span className="text-sm font-medium text-slate-200">
                        {field.label}
                      </span>

                      <div className="flex gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400/60"
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
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                            onClick={() => toggleVisibility(field.key)}
                          >
                            {isVisible ? "Hide" : "Show"}
                          </button>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-5 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-300">
              {isDirty
                ? "Unsaved changes detected."
                : "No pending settings changes."}
            </p>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              disabled={!isDirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save settings"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
