import type { PublishStatus } from "../types";

const STATUS_STYLES: Record<PublishStatus, string> = {
  draft: "border-slate-400/20 bg-slate-400/10 text-slate-200",
  scheduled: "border-sky-400/30 bg-sky-400/10 text-sky-100",
  published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  failed: "border-rose-400/30 bg-rose-400/10 text-rose-100",
  cancelled: "border-amber-400/30 bg-amber-400/10 text-amber-100",
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
      {status}
    </span>
  );
}
