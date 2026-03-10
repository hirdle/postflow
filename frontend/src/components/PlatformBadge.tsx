type PlatformTone = "telegram" | "vk";

const PLATFORM_STYLES: Record<PlatformTone, string> = {
  telegram: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
  vk: "border-indigo-400/30 bg-indigo-400/10 text-indigo-100",
};

interface PlatformBadgeProps {
  platform: PlatformTone;
}

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        PLATFORM_STYLES[platform],
      ].join(" ")}
    >
      {platform === "telegram" ? "TG" : "VK"}
    </span>
  );
}
