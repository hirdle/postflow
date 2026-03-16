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
  vk_client_id: string;
  vk_access_token: string;
  vk_group_id: string;
  vk_group_name: string;
  image_api_key: string;
  image_base_url: string;
  image_default_model: string;
}

export type VkAuthStatus = "not_connected" | "connected" | "expired";

export interface SettingsResponseData extends SettingsFormValues {
  vk_refresh_token: string;
  vk_account_label: string;
  vk_auth_status: VkAuthStatus;
  vk_token_expires_at: string | null;
}

export type TelegramSessionStatus =
  | "waiting_for_scan"
  | "password_required"
  | "authorized"
  | "expired"
  | "failed"
  | "cancelled";

export interface TelegramSessionState {
  session_id: string;
  status: TelegramSessionStatus;
  started_at: string;
  expires_at: string | null;
  qr_url: string | null;
  qr_image_data_url: string | null;
  error: string | null;
  account_label: string | null;
}

export type VkAuthSessionStatus =
  | "waiting_for_callback"
  | "authorizing"
  | "authorized"
  | "expired"
  | "failed"
  | "cancelled";

export interface VkCommunityOption {
  group_id: string;
  name: string;
  screen_name: string | null;
  role: "admin" | "editor";
  can_post: boolean;
}

export interface VkAuthSessionState {
  session_id: string;
  status: VkAuthSessionStatus;
  started_at: string;
  expires_at: string | null;
  authorize_url: string | null;
  error: string | null;
  account_label: string | null;
  communities: VkCommunityOption[];
}

export interface VkCommunitiesResponse {
  communities: VkCommunityOption[];
}
