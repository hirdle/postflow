const BACKEND_MESSAGE_MAP: Record<string, string> = {
  "VK access token is not configured in app_settings.":
    "Токен доступа VK не настроен в app_settings.",
  "VK client ID is not configured in app_settings.":
    "VK App ID не настроен в app_settings.",
  "Image API key is not configured in app_settings.":
    "Ключ Image API не настроен в app_settings.",
  "VK redirect URI must be one of the configured localhost callback URLs.":
    "VK redirect URI не совпадает с разрешенными localhost callback URL.",
  "VK auth state mismatch. Start the authorization again.":
    "VK callback вернулся с неверным state. Запустите подключение снова.",
  "VK authorization session expired. Start a new session.":
    "VK auth flow истек. Запустите подключение снова.",
  "VK refresh token metadata is incomplete. Reconnect VK in settings.":
    "Для обновления VK токена не хватает сохраненных данных. Переподключите VK.",
  "VK token refresh failed. Reconnect VK in settings.":
    "Не удалось обновить VK токен. Переподключите VK в настройках.",
};

export function formatBackendErrorMessage(message: string) {
  return BACKEND_MESSAGE_MAP[message] ?? message;
}
