const BACKEND_MESSAGE_MAP: Record<string, string> = {
  "VK access token is not configured in app_settings.":
    "Токен доступа VK не настроен в app_settings.",
  "Image API key is not configured in app_settings.":
    "Ключ Image API не настроен в app_settings.",
};

export function formatBackendErrorMessage(message: string) {
  return BACKEND_MESSAGE_MAP[message] ?? message;
}
