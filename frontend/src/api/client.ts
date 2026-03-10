const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(buildApiUrl(path), {
    headers: isFormData
      ? init?.headers
      : {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
    ...init,
  });

  if (!response.ok) {
    let message = `API request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as { detail?: string };
      if (typeof payload.detail === "string" && payload.detail.trim()) {
        message = payload.detail;
      }
    } catch {
      // Ignore non-JSON error responses and keep the default message.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
