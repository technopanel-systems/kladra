"use client";

import { Fragment } from "react";
import { useLocale } from "next-intl";
import { Bar, BarChart, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts";
import type { Ink } from "@/components/metrics/colors";
import { ChartContainer } from "@/components/ui/chart";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link, useRouter } from "@/i18n/navigation";
import { dirOf } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** One thing compared with the others: a month, a person, a kind of customer. */
export type BarRow = {
  /** Stable, and the spec's handle on which bar is which (`data-bar`). */
  key: string;
  label: string;
  /**
   * A second line under a column's label — the year, written where it turns
   * over. `null` keeps the slot empty so every column stands on one baseline
   * (D65); `undefined` draws no second line at all.
   */
  sublabel?: string | null;
  /** One per series, in the series' order. */
  values: number[];
  /** Each value in the app's own formatting, unit included where it has one. */
  figures: string[];
  /** The list each bar counts, or null where there is none to open (D117). */
  hrefs: (string | null)[];
  /** A bar's own colour where the row is somebody (their tint) or a state. */
  inks?: Ink[];
  /** Where a target sat, drawn as a dashed rule across the first series' bar. */
  target?: number | null;
  /** Attributes on the row's text, for a spec (`data-month`). */
  data?: Record<string, string>;
};

export type BarSeries = { key: string; label: string; ink: Ink };

const COLUMN_PLOT = "h-24"; // 96px of bar under the figures
const ROW_HEIGHT_REM = 3; // 48px a row: two lines of a name, and a thumb's reach (D130)

/**
 * A comparison or a trend, drawn as bars (SPEC §3 P13, DESIGN §1b).
 *
 * The drawing is Recharts inside the kit's `ChartContainer`, and the words are
 * not in it. Every figure and every label is HTML laid out on the same grid as
 * the bars and drawn over them, for three reasons that were each a defect once:
 * a label in SVG cannot wrap, so a long name is either cut or runs into the
 * next one, and a label is never cut (D65); SVG text anchors flip meaning under
 * `dir="rtl"` while HTML simply flows; and the text beside the drawing is what a
 * reader who cannot see the bars reads (D61, D150), so it must be text that
 * reads in order with its label, not a second list.
 *
 * Two orientations, one component. **Columns** for a run of months, the way a
 * calendar is read across. **Rows** for people and kinds of customer, whose
 * names are of every length and read down a page. Recharts has no RTL, so the
 * value axis is reversed in Arabic: the first column sits at the inline start,
 * and a row's bar grows from the inline start, exactly where the HTML beside it
 * already is (DESIGN §1b; the Arabic project of every chart spec asserts it).
 *
 * Every bar is a door (D117): the bar itself for a pointer, and the figure as a
 * real link for everybody else. Nothing animates.
 */
export function BarsChart({
  rows,
  series,
  orientation,
  label,
  unit,
}: {
  rows: BarRow[];
  series: BarSeries[];
  orientation: "columns" | "rows";
  /** What the bars compare, for a reader who cannot see them. */
  label: string;
  /** The unit beside each figure on a row — m² — kept out of the digits' run. */
  unit?: string;
}) {
  const rtl = dirOf(useLocale()) === "rtl";
  const router = useRouter();

  // One scale for every bar, headroom included, and the targets inside it so a
  // month that missed badly looks like it did.
  const ceiling = Math.max(
    1,
    ...rows.flatMap((row) => [...row.values, row.target ?? 0]),
  );
  const data = rows.map((row) => ({
    key: row.key,
    target: row.target ?? null,
    ...Object.fromEntries(row.values.map((value, i) => [`v${i}`, value])),
  }));

  const inkOf = (row: BarRow | undefined, i: number): Ink =>
    row?.inks?.[i] ?? series[i]?.ink ?? { fill: "var(--text-muted)", opacity: 1 };

  const shapeFor = (i: number) =>
    function BarShape(props: BarShapeProps) {
      const row = rows[props.index];
      const ink = inkOf(row, i);
      const href = row?.hrefs[i] ?? null;
      const plot = props.parentViewBox;
      const targetAt =
        i === 0 && row?.target && plot
          ? orientation === "columns"
            ? plot.y + plot.height * (1 - row.target / ceiling)
            : null
          : null;
      return (
        <g data-bar={`${row?.key}:${series[i]?.key}`} className={cn(href && "cursor-pointer")}>
          {/* A sliver for almost nothing, so nothing and a little are two facts. */}
          {row && row.values[i] > 0 ? (
            <Rectangle
              {...props}
              // A reversed axis draws with a negative extent, so the floor keeps
              // the sign it was given.
              {...(orientation === "columns"
                ? {
                    y: props.y + props.height - atLeast(props.height, 2),
                    height: atLeast(props.height, 2),
                  }
                : { width: atLeast(props.width, 2) })}
              // A reversed axis hands the bar a negative width, which turns
              // the corners round with it: the far end is rounded either way.
              radius={orientation === "columns" ? [3, 3, 0, 0] : [0, 3, 3, 0]}
              fill={ink.fill}
              fillOpacity={ink.opacity}
            />
          ) : null}
          {targetAt !== null ? (
            <line
              x1={props.x - props.width * 0.2}
              x2={props.x + props.width * 1.2}
              y1={targetAt}
              y2={targetAt}
              stroke="var(--text)"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
          ) : null}
        </g>
      );
    };

  const bars = series.map((s, i) => (
    <Bar
      key={s.key}
      dataKey={`v${i}`}
      name={s.label}
      isAnimationActive={false}
      maxBarSize={orientation === "columns" ? 40 : 14}
      shape={shapeFor(i)}
      onClick={(_entry, index) => {
        const href = rows[index]?.hrefs[i];
        if (href) router.push(href);
      }}
    />
  ));

  if (orientation === "columns") {
    return (
      <div data-slot="bars" data-orientation="columns" className="relative">
        {/* Under the text in the order of painting, level with the spacer each
            column keeps for it. */}
        <ChartContainer
          config={{}}
          initialDimension={{ width: 600, height: 96 }}
          className={cn("absolute inset-x-0 top-5 aspect-auto", COLUMN_PLOT)}
        >
          <BarChart
            accessibilityLayer
            title={label}
            data={data}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            barCategoryGap="22%"
            barGap={2}
          >
            <XAxis dataKey="key" hide reversed={rtl} />
            <YAxis hide domain={[0, ceiling]} />
            {bars}
          </BarChart>
        </ChartContainer>

        <ol className="pointer-events-none relative flex">
          {rows.map((row) => (
            <li
              key={row.key}
              {...row.data}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <span className="flex h-5 items-end gap-1">
                {row.figures.map((figure, i) => (
                  <FigureDoor
                    key={series[i]?.key ?? i}
                    href={row.values[i] > 0 ? row.hrefs[i] : null}
                    className={cn(
                      "text-[0.6875rem] leading-tight font-medium",
                      row.values[i] === 0 && "text-faint",
                    )}
                  >
                    {figure}
                  </FigureDoor>
                ))}
              </span>
              <span aria-hidden="true" className={COLUMN_PLOT} />
              <span className="flex w-full flex-col items-center text-[0.6875rem] leading-tight text-muted-foreground">
                <span data-slot="bar-label" className="w-full text-center">
                  {row.label}
                </span>
                {row.sublabel !== undefined ? (
                  <span
                    dir="ltr"
                    aria-hidden={row.sublabel === null ? "true" : undefined}
                    className={cn("num text-faint", row.sublabel === null && "invisible")}
                  >
                    {row.sublabel ?? "0000"}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div
      data-slot="bars"
      data-orientation="rows"
      className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]"
      style={{ gridTemplateRows: `repeat(${rows.length}, ${ROW_HEIGHT_REM}rem)` }}
    >
      <ChartContainer
        config={{}}
        initialDimension={{ width: 400, height: rows.length * ROW_HEIGHT_REM * 16 }}
        className="col-start-2 row-start-1 aspect-auto h-full min-w-0"
        style={{ gridRowEnd: `span ${rows.length}` }}
      >
        <BarChart
          accessibilityLayer
          title={label}
          layout="vertical"
          data={data}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={series.length > 1 ? "18%" : "32%"}
          barGap={2}
        >
          <XAxis type="number" hide reversed={rtl} domain={[0, ceiling]} />
          <YAxis type="category" dataKey="key" hide />
          {bars}
        </BarChart>
      </ChartContainer>

      {rows.map((row, index) => (
        <Fragment key={row.key}>
          <span
            {...row.data}
            className="col-start-1 flex min-w-0 items-center text-sm leading-5"
            style={{ gridRowStart: index + 1 }}
          >
            {row.label}
          </span>
          <span
            className="col-start-3 flex flex-col items-end justify-center gap-0.5"
            style={{ gridRowStart: index + 1 }}
          >
            {row.figures.map((figure, i) => (
              <FigureDoor
                key={series[i]?.key ?? i}
                href={row.values[i] > 0 ? row.hrefs[i] : null}
                unit={unit}
                className={cn(
                  series.length > 1 ? "text-xs leading-4" : "text-sm",
                  "font-medium",
                  i > 0 && "text-muted-foreground",
                  row.values[i] === 0 && "text-faint",
                )}
              >
                {figure}
              </FigureDoor>
            ))}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/** At least `floor` pixels long, in whichever direction the axis runs. */
function atLeast(extent: number, floor: number): number {
  return Math.abs(extent) >= floor ? extent : extent < 0 ? -floor : floor;
}

/** A figure that opens its list, or plain text where it opens nothing. */
function FigureDoor({
  href,
  className,
  unit,
  children,
}: {
  href: string | null;
  className?: string;
  unit?: string;
  children: string;
}) {
  const text = (
    <span className="whitespace-nowrap">
      <span dir="ltr" data-slot="bar-figure" className="num">
        {children}
      </span>
      {unit ? <span className="ms-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
    </span>
  );
  if (!href) return <span className={className}>{text}</span>;
  return (
    <Link
      href={href}
      className={cn(
        "pointer-events-auto inline-flex items-center gap-1 underline decoration-line-strong underline-offset-2",
        className,
      )}
    >
      {text}
      <LinkPending />
    </Link>
  );
}
