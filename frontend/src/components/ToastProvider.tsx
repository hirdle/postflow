import { createContext, useContext, useEffect, useState } from "react";

type ToastTone = "success" | "error" | "warning";

interface ToastPayload {
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  pushToast: (toast: ToastPayload) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function toastClasses(tone: ToastTone) {
  if (tone === "success") {
    return "border-teal-200 bg-teal-50 text-teal-900";
  }
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-rose-200 bg-rose-50 text-rose-900";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <ToastContext.Provider
      value={{
        pushToast(nextToast) {
          setToast(nextToast);
        },
      }}
    >
      {children}
      <div className="pointer-events-none fixed right-5 top-5 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
        {toast ? (
          <div
            className={[
              "rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
              toastClasses(toast.tone),
            ].join(" ")}
          >
            {toast.message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}
