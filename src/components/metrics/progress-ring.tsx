"use client";

import { useLocale, useTranslations } from "next-intl";
import { Pie, PieChart, Sector } from "recharts";
import { TRACK_INK, type Ink } from "@/components/metrics/colors";
import { ChartContainer } from "@/components/ui/chart";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link, useRouter } from "@/i18n/navigation";
import { dirOf } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * How far a population got, drawn as a ring (SPEC §3 P13, DESIGN §1b: "a ring
 * for progress to a target").
 *
 * A share with two parts — of the fourteen projects started, eleven were quoted
 * — is the one place a ring reads better than anything else: there is nothing
 * to compare but the filled arc and the empty one, and the per-cent in the
 * middle says it outright (D150's own caveat, from before the reversal). The
 * fraction is written beside it in words, so the drawing is never the only
 * carrier, and the filled arc and that fraction are the same door: to the list
 * of the part (D117), where there is a list to open.
 *
 * It fills the way the page reads, from twelve o'clock: clockwise in English,
 * anticlockwise in Arabic.
 */
export function ProgressRing({
  part,
  whole,
  label,
  fraction,
  href,
  ink,
  slot,
}: {
  part: number;
  whole: number;
  label: string;
  /** "11 of 14", from the caller's own words. */
  fraction: string;
  href: string | null;
  ink: Ink;
  /** What this ring is, for a spec (`data-ratio`). */
  slot: string;
}) {
  const t = useTranslations();
  const rtl = dirOf(useLocale()) === "rtl";
  const router = useRouter();
  const percent = whole === 0 ? 0 : Math.round((part / whole) * 100);
  const data = [
    { key: "part", value: part, ink },
    { key: "rest", value: Math.max(0, whole - part), ink: TRACK_INK },
  ];
  const door = href && part > 0 ? href : null;

  return (
    <div data-ratio={slot} className={cn("flex items-center gap-3 rounded-md p-2", door && "row-door")}>
      <div className="relative size-20 shrink-0">
        <ChartContainer
          config={{}}
          initialDimension={{ width: 80, height: 80 }}
          className="aspect-square size-20"
        >
          <PieChart accessibilityLayer title={label} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={whole === 0 ? [{ key: "rest", value: 1, ink: TRACK_INK }] : data}
              dataKey="value"
              startAngle={90}
              endAngle={rtl ? 450 : -270}
              innerRadius="72%"
              outerRadius="100%"
              stroke="none"
              isAnimationActive={false}
              onClick={(entry) => {
                if (door && (entry.payload as { key: string }).key === "part") router.push(door);
              }}
              shape={(props, index) => {
                const entry = (whole === 0 ? [{ ink: TRACK_INK, key: "rest" }] : data)[index];
                return (
                  <g className={cn(door && entry?.key === "part" && "cursor-pointer")}>
                    <Sector {...props} fill={entry?.ink.fill} fillOpacity={entry?.ink.opacity} />
                  </g>
                );
              }}
            />
          </PieChart>
        </ChartContainer>
        <span
          aria-hidden="true"
          dir="ltr"
          className="num pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium"
        >
          {t("common.percent", { percent })}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">
          {door ? (
            <Link data-door href={door} className="inline-flex items-center gap-1.5">
              {label}
              <LinkPending />
            </Link>
          ) : (
            label
          )}
        </span>
        {/* The per-cent is in the ring and hidden from a reader, because this
            says the same thing with both of its halves in it. */}
        <span className="text-xs text-muted-foreground">{fraction}</span>
      </div>
    </div>
  );
}
