import { useState } from "react";
import { useParams } from "react-router-dom";

import { PlatformBadge } from "../components/PlatformBadge";
import { PresenceBadge } from "../components/PresenceBadge";
import { PlaceholderCard } from "../components/PlaceholderCard";
import { StatusBadge } from "../components/StatusBadge";

export function PostEditorPage() {
  const { filename } = useParams();
  const title = filename ? `Editing: ${filename}` : "New post";
  const [panel, setPanel] = useState<"editor" | "preview">("editor");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-orange-300/70">
              Editor shell
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Layout уже разбит на editor и preview surface. На desktop видны
              обе колонки, на mobile переключение идёт через tabs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge status="draft" />
            <PlatformBadge platform="telegram" />
            <PresenceBadge label="Unsaved" />
            <PresenceBadge label="Image" active={false} />
            <PresenceBadge label="Poll" active />
          </div>
        </div>
      </section>

      <div className="flex gap-2 xl:hidden">
        <button
          type="button"
          className={[
            "rounded-full border px-4 py-2 text-sm font-medium transition",
            panel === "editor"
              ? "border-teal-400/70 bg-teal-400/15 text-teal-100"
              : "border-white/10 bg-white/5 text-slate-300",
          ].join(" ")}
          onClick={() => setPanel("editor")}
        >
          Editor
        </button>
        <button
          type="button"
          className={[
            "rounded-full border px-4 py-2 text-sm font-medium transition",
            panel === "preview"
              ? "border-teal-400/70 bg-teal-400/15 text-teal-100"
              : "border-white/10 bg-white/5 text-slate-300",
          ].join(" ")}
          onClick={() => setPanel("preview")}
        >
          Preview
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className={panel === "preview" ? "hidden xl:block" : ""}>
          <PlaceholderCard
            title="Editor column"
            description="Каркас редактора уже занимает отдельный роут и готов к подключению форм для metadata, body, poll и image prompt."
            items={[
              "Metadata block: date, time, platform, rubric, hook type",
              "Content block: title, body, hashtags, username",
              "Manual save и dirty state поверх API posts",
            ]}
          />
        </div>

        <div className={panel === "editor" ? "hidden xl:block" : ""}>
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
      </div>
    </div>
  );
}
