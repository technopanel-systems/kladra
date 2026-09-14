"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QuotationLookups } from "@/actions/forms";
import { nextLine, type LineDraft } from "@/components/quotations/quotation-lines";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LineRefusal } from "@/lib/line-refusal";
import { formatMoney, formatSqm, lineSqm, lineTotal, toNumber } from "@/lib/money";
import { STANDARD_WIDTHS } from "@/lib/sheet";
import { cn } from "@/lib/utils";

/**
 * The lines of a load, as a rep sends them (SPEC §3, P13).
 *
 * A dispatch carries the same nine inputs as a quotation's line, in the founder's
 * order — Colour code · Supplier · Fire rating · Class · Qty · Thickness · Width ·
 * Length · Price per m² — because it is the same sheet going out, and the rep may
 * change any of them for this load: a length cut on site, a colour the store is
 * out of, a price agreed on the phone. Laid out the way the quotation's lines are
 * (`quotation-lines.tsx`): a card per line on a phone, a row of one table from
 * `xl`, one DOM for both, the columns fractions of the wide dialog's stated width.
 *
 * It is its own component rather than that one because two things about a load
 * line are not true of a quotation's. **Its number is the quotation's.** A line
 * carried from the paper is "Item 3" on both, even when items 1 and 2 are not on
 * this load — which is the ordinary partial load — so the desk can put the two
 * papers side by side, and a line the rep added is numbered after the paper's
 * last. The quotation form numbers by order, which is right for the paper and
 * would renumber a partial load. **And a carried line says what is left.** The
 * quantity opens on what is still to send, which is the one figure a rep cannot
 * work out in his head (D12); sending fewer is a partial load, and more is said
 * at the field the moment it is typed.
 */

/** A line on the form: the nine inputs, React's key, and the quotation line it came from. */
export type LoadDraft = LineDraft & {
  /** Null on a line the rep added, and on every line of a direct load. */
  quotationItemId: string | null;
};

/** What a carried line knows about the paper: its number there, and what is left to send on it. */
export type CarriedFacts = { position: number; left: number };

/**
 * The number each line is called by, in order: a carried line keeps its
 * quotation number, an added one follows the paper's last (`base`), and on a
 * direct load `base` is nought and the lines are 1, 2, 3. The action numbers the
 * stored rows the same way from the same two facts, so what the form says is
 * what the drawer will say.
 */
export function lineNumbers(
  lines: readonly LoadDraft[],
  carried: ReadonlyMap<string, CarriedFacts>,
  base: number,
): number[] {
  let added = 0;
  return lines.map((line) => {
    const facts = line.quotationItemId ? carried.get(line.quotationItemId) : undefined;
    return facts ? facts.position : base + ++added;
  });
}

/**
 * Number, the nine fields, what is left (on a load from a quotation), m², total,
 * remove. Written once per shape for the header row and every line, so the two
 * cannot drift apart. The extra column is paid for by the supplier, whose value is
 * a letter.
 *
 * The widths are measured, not guessed: each column name's natural width read
 * off the pixels at 1366 in both languages against the column it heads, the
 * wider script deciding. "Sending now" (78px) and «المتبقي للإرسال» (87px) are the
 * two longest names, and the load's quantity column had been given the
 * quotation's "Qty" width, so both locales read "Sending n…" / «المطلوب…» and
 * the direct grid's length read "Length (…" (P13 review). The gap is 6px rather
 * than the quotation's 8: thirteen gaps of two pixels is the width a name needed.
 */
const GRID_WITH_PAPER =
  "xl:grid xl:grid-cols-[1.5rem_minmax(0,5.5fr)_minmax(0,3.5fr)_minmax(0,5.75fr)_minmax(0,5fr)_minmax(0,5.25fr)_minmax(0,5.75fr)_minmax(0,4.5fr)_minmax(0,4.75fr)_minmax(0,4.5fr)_minmax(0,4.75fr)_minmax(0,4.5fr)_minmax(0,5.5fr)_2rem] xl:items-center xl:gap-x-1.5";
const GRID_DIRECT =
  "xl:grid xl:grid-cols-[1.5rem_minmax(0,5.75fr)_minmax(0,6.5fr)_minmax(0,6.75fr)_minmax(0,6.5fr)_minmax(0,5.25fr)_minmax(0,4.75fr)_minmax(0,5fr)_minmax(0,4.75fr)_minmax(0,5fr)_minmax(0,4.75fr)_minmax(0,6fr)_2rem] xl:items-center xl:gap-x-1.5";

export function DispatchLines({
  lookups,
  lines,
  carried,
  base,
  paper,
  onChange,
  disabled,
  refused,
}: {
  lookups: QuotationLookups;
  lines: LoadDraft[];
  /** Every line of the quotation by its id. Empty on a direct load. */
  carried: ReadonlyMap<string, CarriedFacts>;
  /** The quotation's last line number; nought on a direct load. */
  base: number;
  /** Whether there is a quotation behind this load, which is when "left to send" means anything. */
  paper: boolean;
  onChange: (lines: LoadDraft[]) => void;
  disabled?: boolean;
  /**
   * The box the action refused, by the line's place in the list as it was sent
   * (src/lib/line-refusal.ts): marked `aria-invalid`, which is where the caret
   * goes, with the sentence under its line.
   */
  refused?: LineRefusal | null;
}) {
  const t = useTranslations();
  const grid = paper ? GRID_WITH_PAPER : GRID_DIRECT;
  const numbers = lineNumbers(lines, carried, base);

  function patch(key: string, change: Partial<LoadDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  function add() {
    // The sheet of the line above, and nothing else — never its colour or its
    // price (D163) — and never a link to the paper: an added line is not on it.
    onChange([...lines, { ...nextLine(lookups, lines.at(-1)), quotationItemId: null }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div data-slot="dispatch-lines" className="flex flex-col gap-3 xl:card-face xl:gap-0">
        {/* The column names, once, from `xl`. Hidden from a screen reader,
            because every cell below carries its own label. */}
        <div
          aria-hidden="true"
          data-slot="dispatch-lines-head"
          className={cn(
            "hidden border-b border-line bg-surface-2 px-3 py-2 text-xs text-muted-foreground",
            grid,
          )}
        >
          <span />
          <span className="truncate">{t("common.colourCode")}</span>
          <span className="truncate">{t("common.supplier")}</span>
          <span className="truncate">{t("common.fireRating")}</span>
          <span className="truncate">{t("common.class")}</span>
          <span className="truncate">{t("dispatches.sending")}</span>
          {paper ? <span className="truncate">{t("dispatches.remaining")}</span> : null}
          <span className="truncate">{t("common.thickness")}</span>
          <span className="truncate">{t("common.width")}</span>
          <span className="truncate">{t("common.length")}</span>
          <span className="truncate">{t("common.pricePerSqm")}</span>
          <span className="truncate text-end">{t("common.sqm")}</span>
          <span className="truncate text-end">{t("common.lineTotal")}</span>
          <span />
        </div>

        {lines.map((line, index) => {
          const id = (fieldName: string) => `${line.key}-${fieldName}`;
          const facts = line.quotationItemId ? carried.get(line.quotationItemId) : undefined;
          const number = numbers[index];
          const overspent = facts !== undefined && toNumber(line.qty) > facts.left;
          const refusedHere = refused?.index === index ? refused : null;
          // The box the action named is the one that says it is wrong (D43).
          const refusedBox = (name: string) => refusedHere?.field === name;

          return (
            <div
              key={line.key}
              data-slot="dispatch-line"
              data-carried={facts ? "true" : "false"}
              data-position={number}
              className={cn(
                "card-face flex flex-col gap-3 p-3",
                "xl:overflow-visible xl:rounded-none xl:border-x-0 xl:border-t-0 xl:bg-transparent xl:px-3 xl:py-2 xl:shadow-none xl:last:border-b-0",
                grid,
              )}
            >
              <div className="flex items-center justify-between gap-2 xl:contents">
                <h4 className="text-sm font-medium xl:text-xs xl:font-normal xl:text-muted-foreground">
                  <span className="xl:sr-only">{t("quotations.itemNumber", { number })}</span>
                  <span aria-hidden="true" className="num hidden xl:inline">
                    {number}
                  </span>
                </h4>
                {/* The only line cannot be removed: a load with no panels on it is
                    not a load, and a button that refuses on press is the dead
                    control this app does not ship (DESIGN §5). */}
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onChange(lines.filter((row) => row.key !== line.key))}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive xl:order-last xl:size-8 xl:justify-self-end xl:px-0"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    <span className="xl:sr-only">{t("quotations.removeItem")}</span>
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:contents">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={id("colour")} className="xl:sr-only">
                    {t("common.colourCode")}
                  </Label>
                  <Input
                    id={id("colour")}
                    required
                    disabled={disabled}
                    autoComplete="off"
                    // A code, typed in whichever script: it runs the way its
                    // first letter does.
                    dir="auto"
                    className="h-9"
                    value={line.colourCode}
                    onChange={(event) => patch(line.key, { colourCode: event.target.value })}
                    aria-invalid={refusedBox("colourCode") || undefined}
                    aria-describedby={refusedBox("colourCode") ? id("refused") : undefined}
                  />
                </div>

                {(
                  [
                    ["supplier", "supplierId", "common.supplier", lookups.suppliers],
                    ["fire", "fireRatingId", "common.fireRating", lookups.fireRatings],
                    ["class", "classId", "common.class", lookups.classes],
                  ] as const
                ).map(([slot, key, label, options]) => (
                  <div key={slot} className="flex min-w-0 flex-col gap-1.5">
                    <Label id={id(`${slot}-label`)} className="xl:sr-only">
                      {t(label)}
                    </Label>
                    <SearchableSelect
                      aria-labelledby={id(`${slot}-label`)}
                      value={line[key]}
                      onChange={(value) => patch(line.key, { [key]: value })}
                      options={options}
                      disabled={disabled}
                      invalid={refusedBox(key) || undefined}
                      aria-describedby={refusedBox(key) ? id("refused") : undefined}
                      placeholder={t("forms.choose")}
                      searchPlaceholder={t("forms.searchList")}
                      emptyText={t("forms.noMatch")}
                    />
                  </div>
                ))}

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={id("qty")} className="xl:sr-only">
                    {t("dispatches.sending")}
                  </Label>
                  <Input
                    id={id("qty")}
                    required
                    disabled={disabled}
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="off"
                    className="num h-9 text-start"
                    value={line.qty}
                    onChange={(event) => patch(line.key, { qty: event.target.value })}
                    aria-invalid={overspent || refusedBox("qty") || undefined}
                    aria-describedby={
                      overspent ? id("too-much") : refusedBox("qty") ? id("refused") : undefined
                    }
                  />
                </div>

                {paper ? (
                  <div
                    data-slot="line-left"
                    className="flex min-w-0 flex-col gap-1.5 text-sm xl:truncate"
                  >
                    <span className="text-sm leading-none font-medium xl:sr-only">
                      {t("dispatches.remaining")}
                    </span>
                    {facts ? (
                      <span
                        dir="ltr"
                        data-slot="figure-left"
                        className="num h-9 content-center text-start xl:h-auto"
                      >
                        {facts.left}
                      </span>
                    ) : (
                      <span className="h-9 content-center text-xs text-muted-foreground xl:h-auto xl:truncate">
                        {t("dispatches.notOnPaper")}
                      </span>
                    )}
                  </div>
                ) : null}

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label id={id("thickness-label")} className="xl:sr-only">
                    {t("common.thickness")}
                  </Label>
                  <SearchableSelect
                    aria-labelledby={id("thickness-label")}
                    value={line.thicknessId}
                    onChange={(value) => patch(line.key, { thicknessId: value })}
                    options={lookups.thicknesses}
                    disabled={disabled}
                    invalid={refusedBox("thicknessId") || undefined}
                    aria-describedby={refusedBox("thicknessId") ? id("refused") : undefined}
                    placeholder={t("forms.choose")}
                    searchPlaceholder={t("forms.searchList")}
                    emptyText={t("forms.noMatch")}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label id={id("width-label")} className="xl:sr-only">
                    {t("common.width")}
                  </Label>
                  <SearchableSelect
                    aria-labelledby={id("width-label")}
                    value={line.width}
                    onChange={(value) => patch(line.key, { width: value })}
                    options={STANDARD_WIDTHS.map((width) => ({ value: width, label: width }))}
                    disabled={disabled}
                    invalid={refusedBox("width") || undefined}
                    aria-describedby={refusedBox("width") ? id("refused") : undefined}
                    allowCustom
                    placeholder={t("forms.choose")}
                    searchPlaceholder={t("quotations.widthOther")}
                    emptyText={t("forms.noMatch")}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={id("length")} className="xl:sr-only">
                    {t("common.length")}
                  </Label>
                  <Input
                    id={id("length")}
                    required
                    disabled={disabled}
                    inputMode="decimal"
                    dir="ltr"
                    autoComplete="off"
                    className="num h-9 text-start"
                    value={line.length}
                    onChange={(event) => patch(line.key, { length: event.target.value })}
                    aria-invalid={refusedBox("length") || undefined}
                    aria-describedby={refusedBox("length") ? id("refused") : undefined}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={id("price")} className="xl:sr-only">
                    {t("common.pricePerSqm")}
                  </Label>
                  <Input
                    id={id("price")}
                    required
                    disabled={disabled}
                    inputMode="decimal"
                    dir="ltr"
                    autoComplete="off"
                    className="num h-9 text-start"
                    value={line.pricePerSqm}
                    onChange={(event) => patch(line.key, { pricePerSqm: event.target.value })}
                    aria-invalid={refusedBox("pricePerSqm") || undefined}
                    aria-describedby={refusedBox("pricePerSqm") ? id("refused") : undefined}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2 text-sm xl:contents">
                <span className="min-w-0 text-muted-foreground xl:truncate xl:text-end">
                  <span className="xl:sr-only">{t("common.sqm")} </span>
                  <span dir="ltr" className="num font-medium text-foreground">
                    {formatSqm(lineSqm(line))}
                  </span>
                </span>
                <span className="min-w-0 text-muted-foreground xl:truncate xl:text-end">
                  <span className="xl:sr-only">{t("common.lineTotal")} </span>
                  <span dir="ltr" className="num font-medium text-foreground">
                    {formatMoney(lineTotal(line))}
                  </span>
                  <span className="xl:sr-only"> {t("common.sar")}</span>
                </span>
              </div>

              {/* Said at the field, in the app's own words, the moment it is
                  true — not held back until Save (DESIGN §5). Across the whole
                  row from xl, under the line it is about. */}
              {overspent ? (
                <p id={id("too-much")} role="alert" className="text-xs text-destructive xl:col-span-full xl:pt-1">
                  {t("dispatches.tooMuch")}
                </p>
              ) : refusedHere ? (
                // What the action refused on this line, under it (D43).
                <p id={id("refused")} role="alert" className="text-xs text-destructive xl:col-span-full xl:pt-1">
                  {refusedHere.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* A refusal about a line that is no longer on the form — he took it off
          after Save — is still said, under the table. */}
      {refused && refused.index >= lines.length ? (
        <p role="alert" className="text-xs text-destructive">
          {refused.message}
        </p>
      ) : null}

      <div className="flex">
        <Button type="button" variant="outline" disabled={disabled} onClick={add}>
          <Plus aria-hidden="true" />
          {t("quotations.addItem")}
        </Button>
      </div>
    </div>
  );
}
