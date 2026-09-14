import { cn } from "@/lib/utils";

/**
 * The Kladra mark: the one place the mark gradient appears. The letter stays
 * Latin in both locales — a logo is not translated — so the wordmark beside it
 * (common.app) carries the Arabic.
 *
 * Its corner and its letter are on the scales (`rounded-md`, `text-sm`), so a
 * caller that draws it larger — the sign-in screen — moves both by name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md bg-brand text-sm font-semibold text-brand-ink",
        className,
      )}
    >
      K
    </span>
  );
}
