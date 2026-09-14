"use client";

import { useLocale, useTranslations } from "next-intl";
import { Pie, PieChart, Sector, type PieLabelRenderProps } from "recharts";
import type { Ink } from "@/components/metrics/colors";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link, useRouter } from "@/i18n/navigation";
import { dirOf } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** One part of a whole, as the server worked it out: every word and figure already made. */
export type PieSlice = {
  /** Stable across a re-sort; also the spec's handle on which slice is which. */
  key: string;
  label: string;
  /** The figure in the app's own formatting — "3,244" — and its unit, if it has one. */
  figure: string;
  unit?: string;
  /** Whole per cent of the whole the caption names; the slices add up to 100. */
  share: number;
  /** What the angle is drawn from. */
  value: number;
  /** The list this part counts, or null where there is none to open (D117: a zero is not a door). */
  href: string | null;
  ink: Ink;
  /** A quiet second clause on the row: "on 2 projects", "the oldest 3 days ago". */
  caption?: string;
  /** Attributes for the row, for a spec that has to name it (`data-stage`). */
  data?: Record<string, string>;
};

const RADIAN = Math.PI / 180;

/**
 * A share of a whole, drawn as a pie (SPEC §3 P13, DESIGN §1b).
 *
 * The founder saw D150's bars and asked again, so a share is a pie again — and
 * what D150 kept stays kept: the drawing is never the only carrier. Every slice
 * has its share written beside it, and the list next to the drawing names each
 * part with its figure and its share, so nothing has to be measured off an
 * angle. At most six slices; the caller folds the rest (src/lib/slices.ts).
 *
 * Every slice is a door (D117): pressing it opens the list it counts, and the
 * row in the list is the same door as a real link — one tab stop, what a screen
 * reader announces, and a middle-click opens a tab — because a sector in an SVG
 * is none of those things.
 *
 * Recharts has no direction of its own. The order starts at twelve o'clock and
 * runs the way the page reads: clockwise in English, anticlockwise in Arabic,
 * so the first part sits at the inline start of the circle as the first row
 * sits at the top of the list. Labels are digits and a sign, set left-to-right
 * whatever the page, so their anchors mean what the arithmetic says.
 *
 * Nothing animates: a pie that sweeps in on every visit is motion that explains
 * nothing (DESIGN §1b).
 */
export function SharePie({
  slices,
  label,
}: {
  slices: PieSlice[];
  /** What the drawing is a share OF, for a reader who cannot see it. */
  label: string;
}) {
  const t = useTranslations();
  const rtl = dirOf(useLocale()) === "rtl";
  const router = useRouter();
  // A part with nothing in it is a row that says so, and no slice at all.
  const drawn = slices.filter((slice) => slice.value > 0);

  const renderShare = (props: PieLabelRenderProps) => {
    const slice = drawn[props.index];
    if (!slice) return null;
    const cx = Number(props.cx);
    const cy = Number(props.cy);
    const radius = Number(props.outerRadius) + 10;
    const x = cx + radius * Math.cos(-Number(props.midAngle) * RADIAN);
    const y = cy + radius * Math.sin(-Number(props.midAngle) * RADIAN);
    return (
      <text
        x={x}
        y={y}
        direction="ltr"
        textAnchor={Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="num fill-foreground text-xs"
      >
        {t("common.percent", { percent: slice.share })}
      </text>
    );
  };

  return (
    <div data-slot="share-pie" className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <ChartContainer
        config={{}}
        initialDimension={{ width: 184, height: 184 }}
        className="aspect-square w-46 max-w-full shrink-0"
      >
        <PieChart accessibilityLayer title={label} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                nameKey="label"
                formatter={(_value, _name, item) => {
                  const slice = item.payload as PieSlice;
                  return (
                    <span className="flex w-full items-baseline justify-between gap-3">
                      <span>{slice.label}</span>
                      <span dir="ltr" className="num font-medium">
                        {slice.figure}
                        {slice.unit ? ` ${slice.unit}` : ""}
                      </span>
                    </span>
                  );
                }}
              />
            }
          />
          <Pie
            data={drawn}
            dataKey="value"
            nameKey="label"
            startAngle={90}
            endAngle={rtl ? 450 : -270}
            outerRadius="70%"
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={false}
            label={renderShare}
            labelLine={false}
            onClick={(_data, index) => {
              const href = drawn[index]?.href;
              if (href) router.push(href);
            }}
            shape={(props, index) => {
              const slice = drawn[index];
              return (
                <g
                  data-slice={slice?.key}
                  className={cn(slice?.href && "cursor-pointer")}
                >
                  <Sector {...props} fill={slice?.ink.fill} fillOpacity={slice?.ink.opacity} />
                </g>
              );
            }}
          />
        </PieChart>
      </ChartContainer>

      {/* A row's figure stays within reach of its name on a wide card. */}
      <ol className="flex w-full max-w-xl min-w-0 flex-col">
        {slices.map((slice) => (
          <li
            key={slice.key}
            data-slot="share-row"
            {...slice.data}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              slice.href && "row-door",
            )}
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: slice.ink.fill, opacity: slice.value > 0 ? slice.ink.opacity : 0.15 }}
            />
            <span className={cn("flex min-w-0 flex-1 flex-col", slice.value === 0 && "text-faint")}>
              <span>
                {slice.href ? (
                  <Link data-door href={slice.href} className="inline-flex items-center gap-1.5">
                    {slice.label}
                    <LinkPending />
                  </Link>
                ) : (
                  slice.label
                )}
              </span>
              {/* Its own line, and a visible break from the label: read aloud or
                  selected, the two ran together ("…yet the oldest…"). */}
              {slice.caption ? (
                <span className="text-xs text-muted-foreground">
                  <span className="sr-only">{" · "}</span>
                  {slice.caption}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className={cn("whitespace-nowrap font-medium", slice.value === 0 && "text-faint")}>
                <span dir="ltr" className="num">
                  {slice.figure}
                </span>
                {slice.unit ? (
                  <span className="ms-1 text-xs font-normal text-muted-foreground">{slice.unit}</span>
                ) : null}
              </span>
              <span dir="ltr" className="num w-10 text-end text-xs text-muted-foreground">
                {t("common.percent", { percent: slice.share })}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
