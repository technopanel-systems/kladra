"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QuotationLookups } from "@/actions/forms";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatSqm, lineSqm, lineTotal } from "@/lib/money";
import type { DraftLine } from "@/lib/quotation-draft";
import { STANDARD_LENGTH, STANDARD_WIDTH, STANDARD_WIDTHS } from "@/lib/sheet";
import { cn } from "@/lib/utils";

/**
 * The lines of a quotation, as a rep fills them in (SPEC §3, S32).
 *
 * Nine fields in the founder's order: Colour code · Supplier · Fire rating ·
 * Class · **Qty** · Thickness · Width · Length · Price per m². m² is never one
 * of them — it is width × length × qty and the screen shows it as it is typed
 * (S31), because a rep who can see the number appear stops doing the sum on his
 * phone.
 *
 * The order is the founder's and it is not decoration. Qty sat eighth, after
 * the three measurements, for four phases: the list in §3 reads
 * "…Class · Qty · Thickness · Width…", and what a rep says out loud when he
 * quotes is the colour, the make-up and HOW MANY, then the sheet it is on. A
 * form that asks the three dimensions before the count makes him hold the
 * number he came with while he answers three questions about the standard sheet
 * that are already filled in (P12-9, §5 #178).
 *
 * A card per line on a phone and a TABLE on a desk (P13). Nine columns do not
 * fit across 375px and a dialog that scrolls sideways is a dialog nobody fills in
 * on site, so below `xl` each line is a card that widens into four columns where
 * there is room. The dialog is wide from `lg` (`ResponsiveDialog size="wide"`),
 * and from `xl`, where it stands at its full stated width — at 1024 it was 960px
 * and three choices read "Ch…" — the same markup lays out as one row per line
 * under one row of column names: the card's three parts step aside (`xl:contents`) and their fields
 * become the cells. One DOM for both, so a label, an id and a test locator mean
 * the same thing at every width. The columns are fractions of the dialog's
 * stated width with a floor of nothing (`minmax(0, …fr)`), never sized by what is
 * typed into them, which is what kept the old form moving under the rep's hands.
 *
 * The widths a sheet actually comes in are offered as a list, and anything else
 * is typed (§3: 1.24 / 1.5 / 2.0 / Other → number). 4 mm and 5.8 m are what a
 * new line opens on, because that is the standard sheet.
 */

/**
 * The table's thirteen columns from `xl`: the line's number, the nine fields,
 * its m², its total, and the remove control. Written once for the header row and
 * every line, so the two cannot drift a pixel apart. The fractions are the pixel
 * budget of a 1,120px table in sixteenths, looked at in both scripts: the three
 * choices with no default need about 104px to still say "Choose…", a colour
 * code 92 for "RAL 9016", a quantity 56, and a line total 104 for a six-figure
 * line and its halalas.
 */
const LINE_GRID =
  "xl:grid xl:grid-cols-[1.5rem_minmax(0,5.75fr)_minmax(0,6.5fr)_minmax(0,6.75fr)_minmax(0,6.75fr)_minmax(0,3.5fr)_minmax(0,5.25fr)_minmax(0,5.25fr)_minmax(0,4.25fr)_minmax(0,5.25fr)_minmax(0,4.75fr)_minmax(0,6.5fr)_2rem] xl:items-center xl:gap-x-2";

/**
 * One line in the form: the nine fields, plus React's key.
 *
 * The nine are `DraftLine`, which the server side of this also speaks — the
 * lines Edit opens on, the lines Revise copies, and the lines a repeat request
 * starts from all arrive in that shape. The key never leaves the browser: the
 * server numbers the lines by their order.
 */
export type LineDraft = DraftLine & { key: string };

let counter = 0;

export function blankLine(lookups: QuotationLookups): LineDraft {
  counter += 1;
  return {
    key: `line-${counter}`,
    colourCode: "",
    supplierId: "",
    fireRatingId: "",
    classId: "",
    thicknessId: lookups.standardThickness ?? "",
    qty: "1",
    width: STANDARD_WIDTH,
    length: STANDARD_LENGTH,
    pricePerSqm: "",
  };
}

/**
 * The line after the one above it: the same sheet, and nothing else.
 *
 * This business sells the same specification over and over — supplier N, B1,
 * class A, 4 mm, on the standard 1.24 x 5.8 sheet — and every line of one
 * quotation is usually that same sheet in a different colour. Nine fields typed
 * from nothing, four of them dropdowns with no default, was the second thing
 * the rep's day turned up (9A item 7): Add item handed him an empty card and he
 * chose supplier, rating and class again, identically, every time.
 *
 * What the SHEET is carries over. What this LINE asks for does not: the colour
 * code is the identity of a line and the price is the number the whole
 * quotation is measured by, so neither is ever filled in for him. A number a
 * screen writes into a form is a number nobody checks.
 */
export function nextLine(lookups: QuotationLookups, previous?: LineDraft): LineDraft {
  const blank = blankLine(lookups);
  if (!previous) return blank;
  return {
    ...blank,
    supplierId: previous.supplierId,
    fireRatingId: previous.fireRatingId,
    classId: previous.classId,
    thicknessId: previous.thicknessId,
    width: previous.width,
    length: previous.length,
  };
}

/**
 * What the hidden `items` field carries to the action.
 *
 * The key goes; everything else travels as typed and is validated on the far
 * side. Numbers are strings here because they came out of text inputs, and
 * turning them into numbers twice — once hopefully, once properly — is how a
 * comma becomes a NaN nobody notices.
 */
export function linesPayload(lines: LineDraft[]): string {
  return JSON.stringify(
    lines.map((line) => ({
      colourCode: line.colourCode,
      supplierId: line.supplierId,
      fireRatingId: line.fireRatingId,
      classId: line.classId,
      thicknessId: line.thicknessId,
      qty: line.qty,
      width: line.width,
      length: line.length,
      pricePerSqm: line.pricePerSqm,
    })),
  );
}

export function QuotationLines({
  lookups,
  lines,
  onChange,
  disabled,
}: {
  lookups: QuotationLookups;
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();

  function patch(key: string, change: Partial<LineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  function add() {
    onChange([...lines, nextLine(lookups, lines.at(-1))]);
  }

  function remove(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  return (
    <div className="flex flex-col gap-3">
      <div data-slot="quotation-lines" className="flex flex-col gap-3 xl:card-face xl:gap-0">
        {/* The column names, once, from `xl`. Hidden from a screen reader
            because every cell below carries its own label, which is what a
            reader hears as the caret lands in it. */}
        <div
          aria-hidden="true"
          className={cn(
            "hidden border-b border-line bg-surface-2 px-3 py-2 text-xs text-muted-foreground",
            LINE_GRID,
          )}
        >
          <span />
          <span className="truncate">{t("common.colourCode")}</span>
          <span className="truncate">{t("common.supplier")}</span>
          <span className="truncate">{t("common.fireRating")}</span>
          <span className="truncate">{t("common.class")}</span>
          <span className="truncate">{t("common.qty")}</span>
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
          const sqm = lineSqm(line);
          const total = lineTotal(line);

          return (
            <div
              key={line.key}
              // Named so a walk can read the nine boxes in the order they are
              // drawn: the founder's order is a decision (§3) and an order nothing
              // checks is an order that drifts back (P12-9).
              data-slot="quotation-line"
              className={cn(
                "card-face flex flex-col gap-3 p-3",
                // From xl a row of the table rather than a card of its own.
                "xl:overflow-visible xl:rounded-none xl:border-x-0 xl:border-t-0 xl:bg-transparent xl:px-3 xl:py-2 xl:shadow-none xl:last:border-b-0",
                LINE_GRID,
              )}
            >
              <div className="flex items-center justify-between gap-2 xl:contents">
                <h4 className="text-sm font-medium xl:text-xs xl:font-normal xl:text-muted-foreground">
                  <span className="xl:sr-only">{t("quotations.itemNumber", { number: index + 1 })}</span>
                  <span aria-hidden="true" className="num hidden xl:inline">
                    {index + 1}
                  </span>
                </h4>
                {/* The only line cannot be removed: a quotation with no lines is
                    not a quotation, and a button that refuses on press is the
                    dead control this app does not ship (DESIGN §5). Last in the
                    row from xl, where it is a column of its own. */}
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => remove(line.key)}
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
                    inputMode="text"
                    // A code, typed in whichever script: it runs the way its
                    // first letter does, so "RAL 9016" in an Arabic form starts
                    // at its R rather than losing it off the start of the box.
                    dir="auto"
                    className="h-9"
                    value={line.colourCode}
                    onChange={(event) => patch(line.key, { colourCode: event.target.value })}
                    placeholder={t("quotations.colourPlaceholder")}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label id={id("supplier-label")} className="xl:sr-only">
                    {t("common.supplier")}
                  </Label>
                  <SearchableSelect
                    aria-labelledby={id("supplier-label")}
                    value={line.supplierId}
                    onChange={(value) => patch(line.key, { supplierId: value })}
                    options={lookups.suppliers}
                    disabled={disabled}
                    placeholder={t("forms.choose")}
                    searchPlaceholder={t("forms.searchList")}
                    emptyText={t("forms.noMatch")}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label id={id("fire-label")} className="xl:sr-only">
                    {t("common.fireRating")}
                  </Label>
                  <SearchableSelect
                    aria-labelledby={id("fire-label")}
                    value={line.fireRatingId}
                    onChange={(value) => patch(line.key, { fireRatingId: value })}
                    options={lookups.fireRatings}
                    disabled={disabled}
                    placeholder={t("forms.choose")}
                    searchPlaceholder={t("forms.searchList")}
                    emptyText={t("forms.noMatch")}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label id={id("class-label")} className="xl:sr-only">
                    {t("common.class")}
                  </Label>
                  <SearchableSelect
                    aria-labelledby={id("class-label")}
                    value={line.classId}
                    onChange={(value) => patch(line.key, { classId: value })}
                    options={lookups.classes}
                    disabled={disabled}
                    placeholder={t("forms.choose")}
                    searchPlaceholder={t("forms.searchList")}
                    emptyText={t("forms.noMatch")}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={id("qty")} className="xl:sr-only">
                    {t("common.qty")}
                  </Label>
                  <Input
                    id={id("qty")}
                    required
                    disabled={disabled}
                    inputMode="numeric"
                    dir="ltr"
                    className="num h-9 text-start"
                    value={line.qty}
                    onChange={(event) => patch(line.key, { qty: event.target.value })}
                  />
                </div>

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
                    className="num h-9 text-start"
                    value={line.length}
                    onChange={(event) => patch(line.key, { length: event.target.value })}
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
                    className="num h-9 text-start"
                    value={line.pricePerSqm}
                    onChange={(event) => patch(line.key, { pricePerSqm: event.target.value })}
                  />
                </div>
              </div>

              {/* Its m² and its total: under the card on a phone, the last two
                  figures of the row from xl, where the column names say what
                  they are. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2 text-sm xl:contents">
                <span className="min-w-0 text-muted-foreground xl:truncate xl:text-end">
                  <span className="xl:sr-only">{t("common.sqm")} </span>
                  <span dir="ltr" className="num font-medium text-foreground">
                    {formatSqm(sqm)}
                  </span>
                </span>
                <span className="min-w-0 text-muted-foreground xl:truncate xl:text-end">
                  <span className="xl:sr-only">{t("common.lineTotal")} </span>
                  <span dir="ltr" className="num font-medium text-foreground">
                    {formatMoney(total)}
                  </span>
                  <span className="xl:sr-only"> {t("common.sar")}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex">
        <Button type="button" variant="outline" disabled={disabled} onClick={add}>
          <Plus aria-hidden="true" />
          {t("quotations.addItem")}
        </Button>
      </div>
    </div>
  );
}
