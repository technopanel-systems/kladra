import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BarsChart, type BarRow } from "@/components/metrics/bars-chart";
import { personInk, rankInk, toneInk } from "@/components/metrics/colors";
import { SharePie, type PieSlice } from "@/components/metrics/share-pie";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { ScrollLine } from "@/components/ui-ext/sticky-scroll";
import { Link } from "@/i18n/navigation";
import { doorFor, type Answer } from "@/lib/builder";
import {
  BREAKDOWNS,
  MEASURES,
  PERIODS,
  inMetres,
  questionQuery,
  shapeFor,
  type Question,
} from "@/lib/builder-choice";
import {
  breakdownWord,
  builderTable,
  columnWord,
  meansWord,
  measureWord,
  periodWord,
} from "@/lib/builder-table";
import { formatDay, formatMonthName } from "@/lib/dates";
import { formatNumber, formatSqmWhole, toNumber } from "@/lib/money";
import { foldForPie, wholePercents } from "@/lib/slices";
import { cn } from "@/lib/utils";

/**
 * The report builder, on the manager's metrics tab (SPEC §3 P13, 13.2).
 *
 * Four blanks — what, by what, over when, for whom — and the answer drawn in the
 * shape the question asks for (`shapeFor`), with the TABLE under it carrying
 * every row, because a drawing is never the only carrier (D150) and a pie shows
 * six parts of what may be ten. The fourth blank is the tab's own picker at the
 * top, which scopes everything on the tab and so this too (D152).
 *
 * The three choices are chips, the app's one control for a short closed list
 * that lives in the address (D145), and each lands back on this card (`#builder`)
 * rather than on the top of a long tab. Export CSV is a link to the same question
 * as a file (D19).
 *
 * Printed, the card is the page: its question in words, its window, the chart
 * and the table on A4, and nothing a pointer would press — the chips and the
 * button are `print:hidden` here, the shell is hidden where the shell is drawn,
 * and the rest of the tab is hidden by the page (no rule in globals.css).
 *
 * Every bar, slice and figure opens the list it counts where there is one
 * (`doorFor`, D117) — the dispatches for metres and loads, the quotations for
 * the three quotation measures.
 */
export async function BuilderCard({
  answer,
  whose,
  hrefFor,
}: {
  answer: Answer;
  /** The picker's answer in words — a person, or the whole team. */
  whose: string;
  /** The tab's address with this question in it. */
  hrefFor: (question: Question) => string;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const { question, columns } = answer;
  const table = builderTable(answer, t, locale);
  const shape = shapeFor(question);
  const metres = inMetres(question.measure);
  const unit = metres ? t("common.sqm") : undefined;

  /** A figure for reading: whole metres on a drawing, hundredths in the table. */
  const figureOf = (value: string, exact: boolean) =>
    metres ? (exact ? formatNumber(value, 2) : formatSqmWhole(value)) : formatNumber(value, 0);

  const window =
    question.period === "compare" && columns.length === 2
      ? t("metrics.compareWindow", {
          from: formatDay(columns[0].from, locale),
          to: formatDay(columns[0].to, locale),
          lastFrom: formatDay(columns[1].from, locale),
          lastTo: formatDay(columns[1].to, locale),
        })
      : t("metrics.window", {
          from: formatDay(columns[0].from, locale),
          to: formatDay(columns[columns.length - 1].to, locale),
        });

  const empty = answer.rows.every((row) => row.values.every((value) => toNumber(value) === 0));

  const chips = (
    <div className="flex flex-col gap-3 print:hidden">
      <ChoiceRow label={t("metrics.measureLabel")}>
        {MEASURES.map((measure) => (
          <FilterChip
            key={measure}
            href={hrefFor({ ...question, measure })}
            active={question.measure === measure}
          >
            {measureWord(measure, t)}
          </FilterChip>
        ))}
      </ChoiceRow>
      <ChoiceRow label={t("metrics.byLabel")}>
        {BREAKDOWNS.map((by) => (
          <FilterChip key={by} href={hrefFor({ ...question, by })} active={question.by === by}>
            {breakdownWord(by, t)}
          </FilterChip>
        ))}
      </ChoiceRow>
      <ChoiceRow label={t("common.window")}>
        {PERIODS.map((period) => (
          <FilterChip
            key={period}
            href={hrefFor({ ...question, period })}
            active={question.period === period}
          >
            {periodWord(period, t)}
          </FilterChip>
        ))}
      </ChoiceRow>
    </div>
  );

  let chart: React.ReactNode = null;
  if (!empty && shape === "pie") {
    const column = columns[0];
    const cents = (value: string) => Math.round(toNumber(value) * 100);
    const folded = foldForPie(answer.rows, (row) => toNumber(row.values[0]));
    const labelOf = new Map(table.rows.map((row) => [row.key, row.label]));
    const parts = [
      ...folded.kept.map((row) => ({
        key: row.key,
        label: labelOf.get(row.key) ?? "",
        value: toNumber(row.values[0]),
        keys: [row.key],
      })),
      ...(folded.rest.length > 0
        ? [
            {
              key: "rest",
              label: t("metrics.rest", { count: folded.rest.length }),
              value: folded.rest.reduce((sum, row) => sum + cents(row.values[0]), 0) / 100,
              keys: folded.rest.map((row) => row.key),
            },
          ]
        : []),
    ].filter((part) => part.value > 0);
    const shares = wholePercents(parts.map((part) => part.value));
    const slices: PieSlice[] = parts.map((part, index) => ({
      key: part.key,
      label: part.label,
      figure: figureOf(String(part.value), false),
      unit,
      share: shares[index],
      value: part.value,
      href: doorFor(question, part.keys, column),
      ink: rankInk(index),
    }));
    chart = <SharePie slices={slices} label={measureWord(question.measure, t)} />;
  } else if (!empty) {
    const series = columns.map((column, i) => ({
      key: column.key,
      label: columnWord(column, question.measure, t),
      ink: i === 0 ? toneInk("open") : { fill: "var(--text-muted)", opacity: 0.55 },
    }));
    const rows: BarRow[] = answer.rows.map((row, index) => ({
      key: row.key,
      data: { "data-row": row.key },
      label:
        question.by === "month" ? formatMonthName(row.key, locale) : table.rows[index].label,
      sublabel:
        question.by === "month"
          ? index === 0 || row.key.slice(0, 4) !== answer.rows[index - 1].key.slice(0, 4)
            ? row.key.slice(0, 4)
            : null
          : undefined,
      values: row.values.map(toNumber),
      figures: row.values.map((value) => figureOf(value, false)),
      hrefs: columns.map((column) => doorFor(question, [row.key], column)),
      // A person's bar is in that person's tint (DESIGN §1b); the month before
      // stays the quiet second bar beside it.
      inks:
        question.by === "rep"
          ? columns.map((_, i) => (i === 0 ? personInk(row.key) : series[i].ink))
          : undefined,
    }));
    chart = (
      <BarsChart
        orientation={shape === "columns" ? "columns" : "rows"}
        rows={rows}
        series={series}
        label={measureWord(question.measure, t)}
        // A column of months is headed in m² by the table; a row carries its own.
        unit={shape === "rows" ? unit : undefined}
      />
    );
  }

  return (
    <section
      id="builder"
      data-slot="builder"
      aria-labelledby="builder-question"
      className={cn(
        "card-face flex scroll-mt-20 flex-col gap-4 p-4",
        // On paper the card is the page: no edge, no shadow, dark ink on white
        // whichever theme it was read in (a dark card prints as a black page).
        "print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none",
        "print:[&_*]:text-black print:[&_text]:fill-black",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground print:hidden">
            {t("metrics.title")}
          </h2>
          {/* The question in words — which is also the printed page's title. */}
          <p id="builder-question" className="text-base font-medium text-pretty print:text-lg">
            {t("metrics.question", {
              measure: measureWord(question.measure, t),
              by: breakdownWord(question.by, t),
              period: periodWord(question.period, t),
            })}
          </p>
          {/* Two values and a mark between them, each run settling its own way
              (rules/words.md): a name in Arabic on an English page. */}
          <p className="text-xs text-muted-foreground">
            <bdi>{whose}</bdi>
            {" · "}
            <bdi>{window}</bdi>
          </p>
        </div>

        {/* A plain link to a route handler: the answer is a file (D19). */}
        <Button asChild variant="outline" size="sm" className="print:hidden">
          <a
            href={`/api/metrics?${questionQuery(question)}&locale=${locale}`}
            download
          >
            <Download aria-hidden="true" />
            {t("metrics.exportCsv")}
          </a>
        </Button>
      </div>

      {chips}

      {empty ? (
        <p className="text-sm text-muted-foreground">{t("metrics.nothing")}</p>
      ) : (
        // No wider than the printable width of an A4 page: the drawing is
        // measured once, on the screen, and a browser laying the page out for
        // paper does not measure it again — a chart as wide as a desk would run
        // off the sheet.
        <div className="max-w-2xl break-inside-avoid">{chart}</div>
      )}

      <p className="text-xs text-pretty text-muted-foreground">
        {meansWord(question.measure, t)}
      </p>

      {/* Every row, whatever the drawing folded or could not fit (D150). */}
      <Table label={t("metrics.title")} data-slot="builder-table">
        <TableHeader>
          <TableRow>
            {table.head.map((head, i) => (
              <TableHead key={head} className={cn(i > 0 && "text-end")}>
                {head}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.key} data-row={row.key}>
              <TableCell className="whitespace-normal">{row.label}</TableCell>
              {row.figures.map((figure, i) => {
                const href = toNumber(figure) > 0 ? doorFor(question, [row.key], columns[i]) : null;
                const text = (
                  <span dir="ltr" className="num">
                    {figureOf(figure, true)}
                  </span>
                );
                return (
                  <TableCell key={columns[i].key} className="text-end">
                    {href ? (
                      <Link
                        href={href}
                        className="underline decoration-line-strong underline-offset-2 print:no-underline"
                      >
                        {text}
                      </Link>
                    ) : (
                      text
                    )}
                  </TableCell>
                );
              })}
              {(row.won ?? []).map((won, i) => (
                <TableCell key={`won-${columns[i].key}`} className="text-end">
                  <span dir="ltr" className="num">
                    {won}
                  </span>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="print:bg-transparent">
          <TableRow>
            <TableCell>{table.total.label}</TableCell>
            {table.total.figures.map((figure, i) => (
              <TableCell key={columns[i].key} className="text-end">
                <span dir="ltr" className="num">
                  {figureOf(figure, true)}
                </span>
              </TableCell>
            ))}
            {(table.total.won ?? []).map((won, i) => (
              <TableCell key={`won-${columns[i].key}`} className="text-end">
                <span dir="ltr" className="num">
                  {won}
                </span>
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>

      {unit ? <p className="text-xs text-muted-foreground">{t("metrics.inMetres")}</p> : null}
    </section>
  );
}

/**
 * A labelled row of chips: the question's blank, and its answers.
 *
 * One line that scrolls, like every other row of chips since S12.K (S12.7): the
 * seven measures wrapped into three rows on a phone and two in Arabic at 1366,
 * so the builder's own question was a wall of chips before it was a chart. The
 * chosen chip is brought into view when the line cannot show it (`ScrollLine`),
 * and the gap is the chips' own 8, not a tighter one of its own.
 */
function ChoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <ScrollLine className="min-w-0 md:flex-1">{children}</ScrollLine>
    </div>
  );
}
