import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiFetch } from "../api/client";
import { PlatformBadge } from "../components/PlatformBadge";
import { PresenceBadge } from "../components/PresenceBadge";
import { StatusBadge } from "../components/StatusBadge";
import type { Platform, PostListItem, PublishStatus } from "../types";

const SEARCH_DEBOUNCE_MS = 350;

const PLATFORM_OPTIONS: Array<{ value: "all" | Platform; label: string }> = [
  { value: "all", label: "All platforms" },
  { value: "telegram", label: "Telegram" },
  { value: "vk", label: "VK" },
];

const STATUS_OPTIONS: Array<{ value: "all" | PublishStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
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
  if (post.date && post.time) {
    return `${post.date} • ${post.time}`;
  }
  if (post.date) {
    return post.date;
  }
  if (post.time) {
    return post.time;
  }
  return "No schedule";
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
      <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/8 to-transparent p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-orange-300/70">
            Posts overview
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Real posts list is now driven by the backend API
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Список использует `GET /api/posts` и уже умеет фильтровать по
            платформе, статусу, рубрике, датам и поисковому запросу.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            to="/posts/new"
            className="inline-flex items-center justify-center rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
          >
            Create draft
          </Link>
          <p className="text-sm text-slate-400">
            {postsQuery.data?.length ?? 0} posts
            {postsQuery.isFetching && !postsQuery.isLoading ? " • Updating…" : ""}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-2 border-b border-white/10 pb-4">
          <h3 className="text-xl font-semibold text-white">Filters</h3>
          <p className="text-sm leading-6 text-slate-300">
            Поиск обновляется с debounce {SEARCH_DEBOUNCE_MS}ms и отправляет
            фильтры прямо в backend query string.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Platform</span>
            <select
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
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
            <span className="text-sm text-slate-300">Status</span>
            <select
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
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
            <span className="text-sm text-slate-300">Rubric</span>
            <select
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60 disabled:cursor-not-allowed disabled:text-slate-500"
              value={rubricFilter}
              onChange={(event) => setRubricFilter(event.target.value)}
              disabled={rubricOptionsQuery.isLoading && rubrics.length === 0}
            >
              <option value="all">All rubrics</option>
              {rubrics.map((rubric) => (
                <option key={rubric} value={rubric}>
                  {rubric}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Date from</span>
            <input
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Date to</span>
            <input
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-1">
            <span className="text-sm text-slate-300">Search</span>
            <input
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400/60"
              type="search"
              value={searchInput}
              placeholder="Title or body"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span>
            Search term in request: {debouncedSearch ? `"${debouncedSearch}"` : "none"}
          </span>
          {hasActiveFilters ? (
            <button
              type="button"
              className="rounded-full border border-white/10 px-4 py-2 text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </section>

      {postsQuery.isLoading ? (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">
          Loading posts from backend...
        </section>
      ) : null}

      {postsQuery.isError ? (
        <section className="rounded-3xl border border-rose-400/30 bg-rose-400/10 p-6 text-rose-100">
          Failed to load posts. Check backend availability and try again.
        </section>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError ? (
        postsQuery.data && postsQuery.data.length > 0 ? (
          <section className="grid gap-4">
            {postsQuery.data.map((post) => (
              <Link
                key={post.file_name}
                to={`/posts/${post.file_name}`}
                className="block rounded-2xl border border-white/10 bg-slate-950/40 p-5 transition hover:border-teal-400/40 hover:bg-slate-950/70"
              >
                <article className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                      <span>{formatSchedule(post)}</span>
                      <span className="h-1 w-1 rounded-full bg-white/20" />
                      <span>{post.file_name}</span>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {post.title || "Untitled draft"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {post.rubric || "Без рубрики"} • {post.post_type || "Без типа"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                    <StatusBadge status={post.status} />
                    {post.platform ? (
                      <PlatformBadge platform={post.platform} />
                    ) : (
                      <PresenceBadge label="Platform n/a" active={false} />
                    )}
                    <PresenceBadge label="Image" active={post.has_image} />
                    <PresenceBadge label="Poll" active={post.has_poll} />
                  </div>
                </article>
              </Link>
            ))}
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
            <h3 className="text-xl font-semibold text-white">No posts found</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Текущие фильтры не вернули результатов. Очистите фильтры или
              создайте новый draft.
            </p>
          </section>
        )
      ) : null}
    </div>
  );
}
