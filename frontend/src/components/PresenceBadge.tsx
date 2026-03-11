interface PresenceBadgeProps {
  label: string;
  active?: boolean;
}

export function PresenceBadge({
  label,
  active = true,
}: PresenceBadgeProps) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-slate-200 bg-white text-slate-700"
          : "border-slate-200 bg-slate-100 text-slate-500",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
