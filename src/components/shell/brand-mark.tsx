import { cn } from "@/lib/utils";

/**
 * The Kladra mark: the one place the mark gradient appears. The letter stays
 * Latin in both locales — a logo is not translated — so the wordmark beside it
 * (common.app) carries the Arabic.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-[9px] bg-(image:--mark-grad) text-[13px] font-bold text-brand-ink",
        className,
      )}
    >
      K
    </span>
  );
}
