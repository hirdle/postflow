export type Platform = "telegram" | "vk";
export type PublishStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "failed"
  | "cancelled";
export type ValidationLevel = "error" | "warning" | "info";

export interface PlaceholderCardProps {
  title: string;
  description: string;
  items: string[];
}

export interface PostListItem {
  file_name: string;
  date: string | null;
  time: string | null;
  platform: Platform | null;
  post_type: string | null;
  rubric: string | null;
  title: string | null;
  status: PublishStatus;
  has_image: boolean;
  has_poll: boolean;
}

export interface PollData {
  question: string;
  options: string[];
}

export interface PostDetail extends PostListItem {
  hook_type: string | null;
  body: string | null;
  username: string | null;
  hashtags: string[];
  poll: PollData | null;
  image_prompt: string | null;
  raw_markdown: string;
}

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
}

export interface PreviewResponse {
  rendered_text: string;
  poll: PollData | null;
  validation: ValidationIssue[];
  char_count: number;
  platform: Platform | null;
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
