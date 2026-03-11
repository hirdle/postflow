import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiFetch } from "../api/client";
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
  return `${item.scheduled_date} ${item.scheduled_time}`;
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
        message: `Cancelled schedule for ${item.file_name}.`,
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
            : "Failed to cancel the schedule.",
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
        message: `Rescheduled ${record.file_name} to ${record.scheduled_date} ${record.scheduled_time}.`,
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
            : "Failed to reschedule the post.",
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
      `Cancel the scheduled publish for ${item.file_name}?`,
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
        message: "Both date and time are required to reschedule.",
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
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-orange-300/70">
              Schedule ops
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Scheduled posts
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Review queued publications, open the source post in the editor,
              cancel a queued item, or move it to a new slot.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
            {items.length} scheduled items
          </div>
        </div>
      </section>

      {schedulesQuery.isLoading ? (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">
          Loading scheduled posts from the backend...
        </section>
      ) : null}

      {schedulesQuery.isError ? (
        <section className="rounded-3xl border border-rose-400/30 bg-rose-400/10 p-6 text-rose-100">
          {schedulesQuery.error instanceof Error
            ? schedulesQuery.error.message
            : "Failed to load scheduled posts."}
        </section>
      ) : null}

      {!schedulesQuery.isLoading &&
      hasLoadedSchedules &&
      items.length === 0 ? (
        <section
          className="rounded-3xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center"
          data-schedules-empty="true"
        >
          <h3 className="text-xl font-semibold text-white">
            Нет запланированных публикаций
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Scheduled items will appear here after you queue a post from the
            editor dialog.
          </p>
          <Link
            className="mt-5 inline-flex rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
            to="/"
          >
            Back to posts
          </Link>
        </section>
      ) : null}

      {hasLoadedSchedules && items.length > 0 ? (
        <section className="space-y-4">
          {items.map((item) => {
            const isEditing = editingRecordId === item.id;
            const isCanceling = cancelingRecordId === item.id && cancelMutation.isPending;
            const isRescheduling =
              reschedulingRecordId === item.id && rescheduleMutation.isPending;

            return (
              <article
                key={item.id}
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
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
                        className="text-lg font-semibold text-white transition hover:text-teal-200"
                        to={`/posts/${item.file_name}`}
                      >
                        {item.file_name}
                      </Link>
                      <p className="mt-2 text-sm text-slate-400">
                        Scheduled slot: {formatSchedule(item)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      disabled={hasScheduleActionPending}
                      onClick={() => beginReschedule(item)}
                    >
                      {isEditing ? "Editing slot" : "Reschedule"}
                    </button>

                    <button
                      type="button"
                      className="rounded-full border border-rose-300/20 px-4 py-3 text-sm font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                      disabled={hasScheduleActionPending}
                      onClick={() => {
                        void handleCancel(item);
                      }}
                    >
                      {isCanceling ? "Cancelling..." : "Cancel"}
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div
                    className="mt-5 rounded-[28px] border border-white/10 bg-slate-950/40 p-5"
                    data-reschedule-form={item.id}
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-200">
                          New date
                        </span>
                        <input
                          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                          type="date"
                          value={rescheduleDate}
                          disabled={hasScheduleActionPending}
                          onChange={(event) => setRescheduleDate(event.target.value)}
                        />
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-200">
                          New time
                        </span>
                        <input
                          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                          type="time"
                          value={rescheduleTime}
                          disabled={hasScheduleActionPending}
                          onChange={(event) => setRescheduleTime(event.target.value)}
                        />
                      </label>

                      <div className="flex flex-col justify-end gap-3 sm:flex-row md:flex-col">
                        <button
                          type="button"
                          className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                          disabled={hasScheduleActionPending}
                          onClick={() => {
                            void handleReschedule(item);
                          }}
                        >
                          {isRescheduling ? "Saving..." : "Save slot"}
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                          disabled={hasScheduleActionPending}
                          onClick={cancelReschedule}
                        >
                          Cancel edit
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
