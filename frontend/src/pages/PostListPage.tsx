import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiFetch } from "../api/client";
import { formatScheduleValue } from "../lib/format";
import { PlatformBadge } from "../components/PlatformBadge";
import { PresenceBadge } from "../components/PresenceBadge";
import { StatusBadge } from "../components/StatusBadge";
import type { Platform, PostListItem, PublishStatus } from "../types";

const SEARCH_DEBOUNCE_MS = 350;

const PLATFORM_OPTIONS: Array<{ value: "all" | Platform; label: string }> = [
  { value: "all", label: "Все платформы" },
  { value: "telegram", label: "Telegram" },
  { value: "vk", label: "VK" },
];

const STATUS_OPTIONS: Array<{ value: "all" | PublishStatus; label: string }> = [
  { value: "all", label: "Все статусы" },
  { value: "draft", label: "Черновики" },
  { value: "scheduled", label: "Запланированные" },
  { value: "published", label: "Опубликованные" },
  { value: "failed", label: "С ошибкой" },
  { value: "cancelled", label: "Отмененные" },
];

function buildPostsPath(filters: {
  platform: "all" | Platform;
  status: "all" | PublishStatus;
  rubric: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}) {
  const params = new URLSearchParams();

  if (filters.platform !== "all") {
    params.set("platform", filters.platform);
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.rubric !== "all") {
    params.set("rubric", filters.rubric);
  }
  if (filters.dateFrom) {
    params.set("date_from", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("date_to", filters.dateTo);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }

  const query = params.toString();
  return query ? `/posts?${query}` : "/posts";
}

function formatSchedule(post: PostListItem) {
  return formatScheduleValue(post.date, post.time);
}

function formatPostType(value: string | null) {
  if (!value) {
    return "Без типа";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "educational") {
    return "Образовательный";
  }
  if (normalized === "engagement") {
    return "Вовлекающий";
  }
  if (normalized === "conversion") {
    return "Конверсионный";
  }
  if (normalized === "lifestyle") {
    return "Имиджевый";
  }
  if (normalized === "news") {
    return "Новостной";
  }

  return value;
}

export function PostListPage() {
  const [platformFilter, setPlatformFilter] = useState<"all" | Platform>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PublishStatus>("all");
  const [rubricFilter, setRubricFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const postsQuery = useQuery({
    queryKey: [
      "posts",
      platformFilter,
      statusFilter,
      rubricFilter,
      dateFrom,
      dateTo,
      debouncedSearch,
    ],
    queryFn: () =>
      apiFetch<PostListItem[]>(
        buildPostsPath({
          platform: platformFilter,
          status: statusFilter,
          rubric: rubricFilter,
          dateFrom,
          dateTo,
          search: debouncedSearch,
        }),
      ),
  });

  const rubricOptionsQuery = useQuery({
    queryKey: ["posts", "rubrics"],
    queryFn: () => apiFetch<PostListItem[]>("/posts"),
  });

  const rubricSource = rubricOptionsQuery.data ?? postsQuery.data ?? [];
  const rubrics = Array.from(
    new Set(
      rubricSource
        .map((post) => post.rubric?.trim())
        .filter((rubric): rubric is string => Boolean(rubric)),
    ),
  ).sort((left, right) => left.localeCompare(right, "ru"));

  const hasActiveFilters =
    platformFilter !== "all" ||
    statusFilter !== "all" ||
    rubricFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    searchInput.trim() !== "";

  function resetFilters() {
    setPlatformFilter("all");
    setStatusFilter("all");
    setRubricFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setDebouncedSearch("");
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50 p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-orange-700/70">
            Лента публикаций
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Список постов синхронизирован с API бэкенда
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Раздел использует `GET /api/posts` и уже фильтрует материалы по
            платформе, статусу, рубрике, датам и поисковому запросу.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            to="/posts/new"
            className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500"
          >
            Создать черновик
          </Link>
          <p className="text-sm text-slate-500">
            {postsQuery.data?.length ?? 0} постов
            {postsQuery.isFetching && !postsQuery.isLoading
              ? " • обновляем список…"
              : ""}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
          <h3 className="text-xl font-semibold text-slate-950">Фильтры</h3>
          <p className="text-sm leading-6 text-slate-600">
            Поиск обновляется с debounce {SEARCH_DEBOUNCE_MS} мс и отправляет
            параметры напрямую в query string запроса.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-600">Платформа</span>
            <select
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
              value={platformFilter}
              onChange={(event) =>
                setPlatformFilter(event.target.value as "all" | Platform)
              }
            >
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-600">Статус</span>
            <select
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | PublishStatus)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-600">Рубрика</span>
            <select
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:cursor-not-allowed disabled:text-slate-400"
              value={rubricFilter}
              onChange={(event) => setRubricFilter(event.target.value)}
              disabled={rubricOptionsQuery.isLoading && rubrics.length === 0}
            >
              <option value="all">Все рубрики</option>
              {rubrics.map((rubric) => (
                <option key={rubric} value={rubric}>
                  {rubric}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-600">Дата с</span>
            <input
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-600">Дата по</span>
            <input
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-1">
            <span className="text-sm text-slate-600">Поиск</span>
            <input
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
              type="search"
              value={searchInput}
              placeholder="Заголовок или текст"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span>
            Поисковый запрос: {debouncedSearch ? `"${debouncedSearch}"` : "не задан"}
          </span>
          {hasActiveFilters ? (
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={resetFilters}
            >
              Сбросить фильтры
            </button>
          ) : null}
        </div>
      </section>

      {postsQuery.isLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-600 shadow-sm">
          Загружаем список постов из бэкенда…
        </section>
      ) : null}

      {postsQuery.isError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm">
          Не удалось загрузить посты. Проверьте доступность бэкенда и повторите
          попытку.
        </section>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError ? (
        postsQuery.data && postsQuery.data.length > 0 ? (
          <section className="grid gap-4">
            {postsQuery.data.map((post) => (
              <Link
                key={post.file_name}
                to={`/posts/${post.file_name}`}
                className="block rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:border-teal-200 hover:bg-white"
              >
                <article className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{formatSchedule(post)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>{post.file_name}</span>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">
                        {post.title || "Черновик без заголовка"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {post.rubric || "Без рубрики"} • {formatPostType(post.post_type)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                    <StatusBadge status={post.status} />
                    {post.platform ? (
                      <PlatformBadge platform={post.platform} />
                    ) : (
                      <PresenceBadge label="Платформа не выбрана" active={false} />
                    )}
                    <PresenceBadge label="Изображение" active={post.has_image} />
                    <PresenceBadge label="Опрос" active={post.has_poll} />
                  </div>
                </article>
              </Link>
            ))}
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">
              Посты не найдены
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Текущие фильтры не вернули результатов. Очистите фильтры или
              создайте новый черновик.
            </p>
          </section>
        )
      ) : null}
    </div>
  );
}
