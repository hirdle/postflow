"""Infrastructure layer for external services and persistence."""

from app.infra.image_api_client import (
    CHAT_COMPLETION_MODELS,
    DEFAULT_IMAGE_API_BASE_URL,
    DEFAULT_IMAGE_MODEL,
    ImageApiClient,
    ImageApiSettings,
    load_image_api_settings,
)
from app.infra.telegram_client import (
    DEFAULT_TELEGRAM_SESSION_PATH,
    MSK,
    TelegramAuthSettings,
    TelegramPublisher,
    TelegramSettings,
    load_telegram_auth_settings,
    load_telegram_settings,
)
from app.infra.telegram_qr_auth import (
    TelegramQrAuthManager,
    TelegramQrAuthSnapshot,
    get_telegram_qr_auth_manager,
)
from app.infra.vk_auth import (
    VkAuthManager,
    VkAuthSnapshot,
    get_vk_auth_manager,
)
from app.infra.vk_client import (
    VK_API_BASE,
    VK_API_VERSION,
    VKClient,
    VKCommunity,
    VKSettings,
    VKUserProfile,
    delete_vk_settings,
    load_vk_settings,
    load_vk_settings_map,
    upsert_vk_settings,
)

__all__ = [
    "CHAT_COMPLETION_MODELS",
    "DEFAULT_IMAGE_API_BASE_URL",
    "DEFAULT_IMAGE_MODEL",
    "DEFAULT_TELEGRAM_SESSION_PATH",
    "ImageApiClient",
    "ImageApiSettings",
    "MSK",
    "TelegramAuthSettings",
    "TelegramPublisher",
    "TelegramQrAuthManager",
    "TelegramQrAuthSnapshot",
    "TelegramSettings",
    "VKCommunity",
    "VK_API_BASE",
    "VK_API_VERSION",
    "VKUserProfile",
    "VkAuthManager",
    "VkAuthSnapshot",
    "VKClient",
    "VKSettings",
    "get_telegram_qr_auth_manager",
    "get_vk_auth_manager",
    "delete_vk_settings",
    "load_image_api_settings",
    "load_telegram_auth_settings",
    "load_telegram_settings",
    "load_vk_settings",
    "load_vk_settings_map",
    "upsert_vk_settings",
]
