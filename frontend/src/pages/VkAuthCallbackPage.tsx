import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api/client";
import type { VkAuthSessionState } from "../types";

const VK_SESSION_STORAGE_KEY = "postflow:vk-session-id";
const pendingVkExchangeKeys = new Set<string>();

type CallbackState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function readVkSessionId() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(VK_SESSION_STORAGE_KEY);
}

function clearVkSessionId() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(VK_SESSION_STORAGE_KEY);
}

function readVkCallbackParam(url: URL, key: string) {
  const searchValue = url.searchParams.get(key);
  if (searchValue !== null) {
    return searchValue;
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (!hash) {
    return null;
  }

  return new URLSearchParams(hash).get(key);
}

function readVkSessionIdFromState(state: string | null) {
  if (!state) {
    return null;
  }

  const sessionId = state.split(".")[0] ?? "";
  return /^[a-f0-9]{32}$/i.test(sessionId) ? sessionId : null;
}

export function VkAuthCallbackPage() {
  const navigate = useNavigate();
  const [callbackState, setCallbackState] = useState<CallbackState>({
    status: "loading",
    message: "Завершаем VK-авторизацию и обмениваем код на токены…",
  });

  useEffect(() => {
    let cancelled = false;

    async function finalizeVkAuth() {
      const url = new URL(window.location.href);
      const state = readVkCallbackParam(url, "state");
      const code = readVkCallbackParam(url, "code");
      const accessToken = readVkCallbackParam(url, "access_token");
      const sessionId =
        readVkCallbackParam(url, "session_id") ??
        readVkSessionId() ??
        readVkSessionIdFromState(state);

      if (!sessionId) {
        setCallbackState({
          status: "error",
          message:
            "Не найден активный VK auth session ID. Вернитесь в настройки и запустите подключение заново.",
        });
        return;
      }

      const exchangeKey = [sessionId, state ?? "", code ?? "", accessToken ?? ""].join(":");
      if (pendingVkExchangeKeys.has(exchangeKey)) {
        return;
      }
      pendingVkExchangeKeys.add(exchangeKey);

      try {
        const session = await apiFetch<VkAuthSessionState>(
          `/settings/vk/session/${sessionId}/exchange`,
          {
            method: "POST",
            body: JSON.stringify({
              payload: readVkCallbackParam(url, "payload"),
              access_token: accessToken,
              expires_in: readVkCallbackParam(url, "expires_in"),
              code,
              state,
              user_id: readVkCallbackParam(url, "user_id"),
              scope: readVkCallbackParam(url, "scope"),
              error: readVkCallbackParam(url, "error"),
              error_description: readVkCallbackParam(url, "error_description"),
            }),
          },
        );

        if (cancelled) {
          return;
        }

        clearVkSessionId();
        setCallbackState({
          status: "success",
          message:
            session.account_label !== null
              ? `VK-аккаунт подключен: ${session.account_label}.`
              : "VK-авторизация завершена. Можно вернуться в настройки.",
        });

        window.setTimeout(() => {
          if (window.opener && !window.opener.closed) {
            window.close();
            return;
          }
          navigate("/settings", { replace: true });
        }, 1200);
      } catch (error) {
        if (cancelled) {
          return;
        }

        clearVkSessionId();
        setCallbackState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "VK callback завершился ошибкой.",
        });
      }
    }

    void finalizeVkAuth();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const toneClasses =
    callbackState.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : callbackState.status === "error"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-sky-200 bg-sky-50 text-sky-900";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
      <section
        className={[
          "w-full rounded-[32px] border p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]",
          toneClasses,
        ].join(" ")}
      >
        <p className="text-sm uppercase tracking-[0.26em] opacity-70">
          VK Callback
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          {callbackState.status === "success"
            ? "Подключение завершено"
            : callbackState.status === "error"
              ? "Подключение не удалось"
              : "Обрабатываем ответ VK"}
        </h2>
        <p className="mt-4 text-sm leading-6">{callbackState.message}</p>

        {callbackState.status !== "loading" ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full border border-current/20 bg-white/60 px-5 py-3 text-sm font-semibold transition hover:bg-white/80"
              onClick={() => {
                if (window.opener && !window.opener.closed) {
                  window.close();
                  return;
                }
                navigate("/settings", { replace: true });
              }}
            >
              Вернуться в настройки
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
