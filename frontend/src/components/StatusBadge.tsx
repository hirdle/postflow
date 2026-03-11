import type { PublishStatus } from "../types";

const STATUS_STYLES: Record<PublishStatus, string> = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  scheduled: "border-sky-200 bg-sky-50 text-sky-900",
  published: "border-emerald-200 bg-emerald-50 text-emerald-900",
  failed: "border-rose-200 bg-rose-50 text-rose-900",
  cancelled: "border-amber-200 bg-amber-50 text-amber-900",
};

const STATUS_LABELS: Record<PublishStatus, string> = {
  draft: "Черновик",
  scheduled: "Запланирован",
  published: "Опубликован",
  failed: "Ошибка",
  cancelled: "Отменен",
};

interface StatusBadgeProps {
  status: PublishStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        STATUS_STYLES[status],
      ].join(" ")}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
