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
          ? "border-white/15 bg-white/10 text-slate-100"
          : "border-white/10 bg-slate-900/60 text-slate-400",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
