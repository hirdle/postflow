import { Link } from "react-router-dom";

import { PlatformBadge } from "../components/PlatformBadge";
import { PresenceBadge } from "../components/PresenceBadge";
import { StatusBadge } from "../components/StatusBadge";

const SAMPLE_POSTS = [
  {
    fileName: "2026-03-10-telegram-01.md",
    title: "Балкон зимой и батарея",
    rubric: "Разряд мифов",
    status: "draft" as const,
    platform: "telegram" as const,
    hasImage: true,
    hasPoll: false,
  },
  {
    fileName: "2026-03-12-vk-02.md",
    title: "Температура и аккумулятор: цифры",
    rubric: "Разряд знаний",
    status: "scheduled" as const,
    platform: "vk" as const,
    hasImage: true,
    hasPoll: true,
  },
  {
    fileName: "2026-03-15-telegram-03.md",
    title: "Почему батарея отключается под нагрузкой",
    rubric: "Диагностика",
    status: "published" as const,
    platform: "telegram" as const,
    hasImage: false,
    hasPoll: false,
  },
];

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

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-2 border-b border-white/10 pb-4">
          <h3 className="text-xl font-semibold text-white">
            Status surface
          </h3>
          <p className="text-sm leading-6 text-slate-300">
            Здесь уже есть общие badges для статуса, платформы и image/poll
            presence, которые пойдут в реальный posts list.
          </p>
        </div>

        <div className="mt-5 grid gap-4">
          {SAMPLE_POSTS.map((post) => (
            <article
              key={post.fileName}
              className="rounded-2xl border border-white/10 bg-slate-950/40 p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm text-slate-400">{post.fileName}</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">
                    {post.title}
                  </h4>
                  <p className="mt-2 text-sm text-slate-300">{post.rubric}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={post.status} />
                  <PlatformBadge platform={post.platform} />
                  <PresenceBadge label="Image" active={post.hasImage} />
                  <PresenceBadge label="Poll" active={post.hasPoll} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
