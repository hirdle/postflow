import { Link } from "react-router-dom";

import { PlaceholderCard } from "../components/PlaceholderCard";

export function PostListPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/8 to-transparent p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-orange-300/70">
            Frontend skeleton
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Post list placeholder is wired and routable
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Следующим шагом сюда подключится реальный `GET /api/posts` с
            фильтрами, статусами публикаций и поиском.
          </p>
        </div>

        <Link
          to="/posts/new"
          className="inline-flex items-center justify-center rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
        >
          Create draft
        </Link>
      </section>

      <PlaceholderCard
        title="Planned list surface"
        description="Пока здесь только каркас страницы, но роут, Tailwind и общая shell-структура уже готовы."
        items={[
          "Фильтр по платформе, дате, статусу и рубрике",
          "Поиск по title и body с debounce",
          "Сводка по image/poll/status для каждого поста",
        ]}
      />
    </div>
  );
}
