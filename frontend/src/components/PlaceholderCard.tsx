import type { PlaceholderCardProps } from "../types";

export function PlaceholderCard({
  title,
  description,
  items,
}: PlaceholderCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
        {description}
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
