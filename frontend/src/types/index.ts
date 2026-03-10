export type Platform = "telegram" | "vk";

export interface PlaceholderCardProps {
  title: string;
  description: string;
  items: string[];
}

export interface SettingsFormValues {
  telegram_api_id: string;
  telegram_api_hash: string;
  telegram_session_path: string;
  telegram_channel: string;
  vk_access_token: string;
  vk_group_id: string;
  image_api_key: string;
  image_base_url: string;
  image_default_model: string;
}
