"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { RANGE_COOKIE, type Range } from "@/lib/ranges";

/**
 * The window every figure below it is measured over (D152, D154).
 *
 * Three named windows and no date boxes. Two pickers on a phone is four taps
 * before a figure appears, and the questions on this tab are not asked about
 * arbitrary spans — they are asked about the month, the quarter and the year,
 * which is how the business already talks about its own work.
 *
 * The chips are `FilterChip`, the same object the quotations and dispatches
 * lists filter with, because this is the same idea: a choice that lives in the
 * URL, so it is a place a manager can send somebody, and a selected state said
 * with `aria-current` rather than with colour alone (D145 — that chip was
 * written four times before it was written once).
 *
 * The memory is a cookie written here in the browser rather than a server
 * action, for the reason `ViewSwitch` and `PageTabs` both give: it is a
 * preference, nothing else reads it, and a round trip would make pressing it
 * slower than acting on it.
 */
export function RangeChips({
  range,
  chips,
}: {
  range: Range;
  /** In the order they are read, each with the address it lives at. */
  chips: { value: Range; href: string }[];
}) {
  const t = useTranslations();

  useEffect(() => {
    // A year, and `lax` so it survives following a link in from an email.
    document.cookie = `${RANGE_COOKIE}=${range}; path=/; max-age=31536000; samesite=lax`;
  }, [range]);

  return (
    <div
      role="group"
      aria-label={t("common.window")}
      data-slot="range-chips"
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <FilterChip key={chip.value} href={chip.href} active={chip.value === range}>
          {t(`common.range.${chip.value}`)}
        </FilterChip>
      ))}
    </div>
  );
}
