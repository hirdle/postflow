import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiFetch } from "../api/client";
import { formatScheduleValue } from "../lib/format";
import { PlatformBadge } from "../components/PlatformBadge";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import type { PublishRecord, ScheduledPost } from "../types";

interface RescheduleVariables {
  item: ScheduledPost;
  scheduled_date: string;
  scheduled_time: string;
}

function formatSchedule(item: ScheduledPost) {
  return formatScheduleValue(item.scheduled_date, item.scheduled_time);
}

export function SchedulesPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const schedulesQuery = useQuery({
    queryKey: ["schedules"],
    queryFn: () => apiFetch<ScheduledPost[]>("/schedules"),
    refetchOnWindowFocus: true,
  });

  const cancelMutation = useMutation({
    mutationFn: async (item: ScheduledPost) => {
      await apiFetch<void>(`/schedules/${item.id}`, {
        method: "DELETE",
      });
      return item;
    },
    onSuccess: async (item) => {
      if (editingRecordId === item.id) {
        setEditingRecordId(null);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["post", item.file_name] }),
      ]);

      pushToast({
        tone: "success",
        message: `Публикация ${item.file_name} снята с расписания.`,
      });
    },
    onError: async (error, item) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["post", item.file_name] }),
      ]);

      pushToast({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось отменить запланированную публикацию.",
      });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({
      item,
      scheduled_date,
      scheduled_time,
    }: RescheduleVariables) =>
      apiFetch<PublishRecord>(`/schedules/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduled_date,
          scheduled_time,
        }),
      }),
    onSuccess: async (record) => {
      setEditingRecordId(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["post", record.file_name] }),
      ]);

      pushToast({
        tone: "success",
        message: `Публикация ${record.file_name} перенесена на ${formatScheduleValue(record.scheduled_date, record.scheduled_time, "новый слот")}.`,
      });
    },
    onError: async (error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({
          queryKey: ["post", variables.item.file_name],
        }),
      ]);

      pushToast({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось перенести публикацию.",
      });
    },
  });

  const items = [...(schedulesQuery.data ?? [])].sort((left, right) =>
    `${left.scheduled_date}T${left.scheduled_time}`.localeCompare(
      `${right.scheduled_date}T${right.scheduled_time}`,
    ),
  );
  const hasLoadedSchedules = schedulesQuery.data !== undefined;

  const cancelingRecordId = cancelMutation.variables?.id ?? null;
  const reschedulingRecordId = rescheduleMutation.variables?.item.id ?? null;
  const hasScheduleActionPending =
    cancelMutation.isPending || rescheduleMutation.isPending;

  function beginReschedule(item: ScheduledPost) {
    setEditingRecordId(item.id);
    setRescheduleDate(item.scheduled_date);
    setRescheduleTime(item.scheduled_time);
  }

  function cancelReschedule() {
    setEditingRecordId(null);
    setRescheduleDate("");
    setRescheduleTime("");
  }

  async function handleCancel(item: ScheduledPost) {
    const confirmed = window.confirm(
      `Отменить запланированную публикацию для ${item.file_name}?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await cancelMutation.mutateAsync(item);
    } catch {}
  }

  async function handleReschedule(item: ScheduledPost) {
    if (!rescheduleDate || !rescheduleTime) {
      pushToast({
        tone: "warning",
        message: "Для переноса нужно указать и дату, и время.",
      });
      return;
    }

    try {
      await rescheduleMutation.mutateAsync({
        item,
        scheduled_date: rescheduleDate,
        scheduled_time: rescheduleTime,
      });
    } catch {}
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-orange-700/70">
              Слоты публикации
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Запланированные посты
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Здесь можно проверить очередь публикаций, открыть исходный пост,
              отменить слот или перенести его на другую дату.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {items.length} элементов в очереди
          </div>
        </div>
      </section>

      {schedulesQuery.isLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-600 shadow-sm">
          Загружаем расписание из бэкенда…
        </section>
      ) : null}

      {schedulesQuery.isError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm">
          {schedulesQuery.error instanceof Error
            ? schedulesQuery.error.message
            : "Не удалось загрузить запланированные публикации."}
        </section>
      ) : null}

      {!schedulesQuery.isLoading &&
      hasLoadedSchedules &&
      items.length === 0 ? (
        <section
          className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-sm"
          data-schedules-empty="true"
        >
          <h3 className="text-xl font-semibold text-slate-950">
            Нет запланированных публикаций
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Когда вы поставите пост в очередь из редактора, он появится здесь.
          </p>
          <Link
            className="mt-5 inline-flex rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            to="/"
          >
            Вернуться к постам
          </Link>
        </section>
      ) : null}

      {hasLoadedSchedules && items.length > 0 ? (
        <section className="space-y-4">
          {items.map((item) => {
            const isEditing = editingRecordId === item.id;
            const isCanceling =
              cancelingRecordId === item.id && cancelMutation.isPending;
            const isRescheduling =
              reschedulingRecordId === item.id && rescheduleMutation.isPending;

            return (
              <article
                key={item.id}
                className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm"
                data-schedule-card={item.id}
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.status} />
                      <PlatformBadge platform={item.platform} />
                    </div>

                    <div>
                      <Link
                        className="text-lg font-semibold text-slate-950 transition hover:text-teal-700"
                        to={`/posts/${item.file_name}`}
                      >
                        {item.file_name}
                      </Link>
                      <p className="mt-2 text-sm text-slate-500">
                        Запланированный слот: {formatSchedule(item)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      disabled={hasScheduleActionPending}
                      onClick={() => beginReschedule(item)}
                    >
                      {isEditing ? "Редактируем слот" : "Перенести"}
                    </button>

                    <button
                      type="button"
                      className="rounded-full border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      disabled={hasScheduleActionPending}
                      onClick={() => {
                        void handleCancel(item);
                      }}
                    >
                      {isCanceling ? "Отменяем…" : "Отменить"}
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div
                    className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5"
                    data-reschedule-form={item.id}
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          Новая дата
                        </span>
                        <input
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                          type="date"
                          value={rescheduleDate}
                          disabled={hasScheduleActionPending}
                          onChange={(event) => setRescheduleDate(event.target.value)}
                        />
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          Новое время
                        </span>
                        <input
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                          type="time"
                          value={rescheduleTime}
                          disabled={hasScheduleActionPending}
                          onChange={(event) => setRescheduleTime(event.target.value)}
                        />
                      </label>

                      <div className="flex flex-col justify-end gap-3 sm:flex-row md:flex-col">
                        <button
                          type="button"
                          className="rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                          disabled={hasScheduleActionPending}
                          onClick={() => {
                            void handleReschedule(item);
                          }}
                        >
                          {isRescheduling ? "Сохраняем…" : "Сохранить слот"}
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:text-slate-400"
                          disabled={hasScheduleActionPending}
                          onClick={cancelReschedule}
                        >
                          Отменить редактирование
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
