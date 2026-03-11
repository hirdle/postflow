import type { Platform } from "../types";

const PLATFORM_STYLES: Record<Platform, string> = {
  telegram: "border-cyan-200 bg-cyan-50 text-cyan-900",
  vk: "border-indigo-200 bg-indigo-50 text-indigo-900",
};

interface PlatformBadgeProps {
  platform: Platform;
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
