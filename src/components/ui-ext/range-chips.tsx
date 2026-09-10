"use client";

import { useTranslations } from "next-intl";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { useRemembered } from "@/hooks/use-remembered";
import { DEFAULT_RANGE, RANGE_SCREEN, parseRange, type Range } from "@/lib/ranges";

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
 * The memory belongs to the person and is written by the same hook the view
 * switch and the tabs use, for the reason `ViewSwitch` gives at length (SPEC
 * §3, D164). It is remembered against the metrics tab rather than against the
 * screen: a rep who set the window to the year on his own figures means the
 * year when he reads the floor's.
 */
export function RangeChips({
  range,
  remembered,
  chips,
}: {
  range: Range;
  /** What was remembered when this page was drawn — nothing, on a first visit. */
  remembered?: string;
  /** In the order they are read, each with the address it lives at. */
  chips: { value: Range; href: string }[];
}) {
  const t = useTranslations();

  useRemembered("range", RANGE_SCREEN, range, parseRange(remembered) ?? DEFAULT_RANGE);

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
