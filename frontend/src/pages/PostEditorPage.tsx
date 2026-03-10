import { useParams } from "react-router-dom";

import { PlaceholderCard } from "../components/PlaceholderCard";

export function PostEditorPage() {
  const { filename } = useParams();
  const title = filename ? `Editing: ${filename}` : "New post";

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
      <PlaceholderCard
        title={title}
        description="Каркас редактора уже занимает отдельный роут и готов к подключению форм для metadata, body, poll и image prompt."
        items={[
          "Metadata block: date, time, platform, rubric, hook type",
          "Content block: title, body, hashtags, username",
          "Manual save и dirty state поверх API posts",
        ]}
      />

      <PlaceholderCard
        title="Preview column"
        description="Правая колонка зарезервирована под Telegram/VK preview и validation summary."
        items={[
          "Tab switcher Telegram / VK",
          "Character count и validation issues",
          "Image and poll preview modules",
        ]}
      />
    </div>
  );
}
