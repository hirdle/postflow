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

export interface PublishRecord {
  id: number | null;
  file_name: string;
  platform: Platform;
  scheduled_date: string | null;
  scheduled_time: string | null;
  message_id: number | null;
  poll_message_id: number | null;
  status: PublishStatus;
  published_at: string | null;
  error: string | null;
  created_at: string | null;
}

export interface PublishAttempt {
  id: number | null;
  file_name: string;
  attempt_type: string;
  payload_snapshot: string | null;
  result: string | null;
  created_at: string | null;
}

export interface PostDetail extends PostListItem {
  hook_type: string | null;
  body: string | null;
  username: string | null;
  hashtags: string[];
  poll: PollData | null;
  image_prompt: string | null;
  raw_markdown: string;
  publish_records: PublishRecord[];
  publish_attempts: PublishAttempt[];
}

export interface ScheduledPost {
  id: number;
  file_name: string;
  platform: Platform;
  scheduled_date: string;
  scheduled_time: string;
  status: PublishStatus;
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

export interface MediaUploadResponse {
  file_name: string;
  image_path: string;
}

export interface MediaGenerateResponse extends MediaUploadResponse {
  model: string | null;
}

export interface MediaModelInfo {
  id: string;
  owned_by: string | null;
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
