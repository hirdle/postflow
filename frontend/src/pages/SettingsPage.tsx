import { PlaceholderCard } from "../components/PlaceholderCard";

export function SettingsPage() {
  return (
    <PlaceholderCard
      title="Settings placeholder"
      description="Роут `/settings` готов для подключения masked settings form и сохранения backend credentials."
      items={[
        "Telegram credentials section",
        "VK credentials section",
        "Image API configuration section",
      ]}
    />
  );
}
