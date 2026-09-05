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

/**
 * The lines of a quotation, as a rep fills them in (SPEC §3, S32).
 *
 * Nine fields in the founder's order: Colour code · Supplier · Fire rating ·
 * Class · Qty · Thickness · Width · Length · Price per m². m² is never one of
 * them — it is width × length × qty and the screen shows it as it is typed
 * (S31), because a rep who can see the number appear stops doing the sum on his
 * phone.
 *
 * A card per line rather than a table. Nine columns do not fit across 375px and
 * a dialog that scrolls sideways is a dialog nobody fills in on site; the same
 * card widens into four columns where there is room.
 *
 * The widths a sheet actually comes in are offered as a list, and anything else
 * is typed (§3: 1.24 / 1.5 / 2.0 / Other → number). 4 mm and 5.8 m are what a
 * new line opens on, because that is the standard sheet.
 */

/**
 * One line in the form: the nine fields, plus React's key.
 *
 * The nine are `DraftLine`, which the server side of this also speaks — the
 * lines Edit opens on, the lines Revise copies, and the lines a repeat request
 * starts from all arrive in that shape. The key never leaves the browser: the
 * server numbers the lines by their order.
 */
export type LineDraft = DraftLine & { key: string };

/** The standard sheet: 1.24 × 5.8 m, 4 mm (S32). */
const STANDARD_WIDTH = "1.24";
const STANDARD_LENGTH = "5.8";
const WIDTH_CHOICES = ["1.24", "1.5", "2.0"];

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
 * Nothing has been typed into this line yet.
 *
 * Asked by the one offer that would otherwise throw work away — "copy the lines
 * from Q-12" replaces what is in the form, so it is only offered while there is
 * nothing in the form to lose. The four fields it asks about are the four a
 * blank line leaves empty; the rest open on the standard sheet and say nothing
 * about whether anybody has been here.
 */
export function isBlankLine(line: LineDraft): boolean {
  return (
    line.colourCode.trim() === "" &&
    line.supplierId === "" &&
    line.fireRatingId === "" &&
    line.classId === "" &&
    line.pricePerSqm.trim() === ""
  );
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
      {lines.map((line, index) => {
        const id = (fieldName: string) => `${line.key}-${fieldName}`;
        const sqm = lineSqm(line);
        const total = lineTotal(line);

        return (
          <div key={line.key} className="card-face flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">
                {t("quotations.itemNumber", { number: index + 1 })}
              </h4>
              {/* The only line cannot be removed: a quotation with no lines is
                  not a quotation, and a button that refuses on press is the
                  dead control this app does not ship (DESIGN §5). */}
              {lines.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => remove(line.key)}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  {t("quotations.removeItem")}
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={id("colour")}>{t("common.colourCode")}</Label>
                <Input
                  id={id("colour")}
                  required
                  disabled={disabled}
                  autoComplete="off"
                  inputMode="text"
                  value={line.colourCode}
                  onChange={(event) => patch(line.key, { colourCode: event.target.value })}
                  placeholder={t("quotations.colourPlaceholder")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label id={id("supplier-label")}>{t("common.supplier")}</Label>
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

              <div className="flex flex-col gap-1.5">
                <Label id={id("fire-label")}>{t("common.fireRating")}</Label>
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

              <div className="flex flex-col gap-1.5">
                <Label id={id("class-label")}>{t("common.class")}</Label>
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

              <div className="flex flex-col gap-1.5">
                <Label id={id("thickness-label")}>{t("common.thickness")}</Label>
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

              <div className="flex flex-col gap-1.5">
                <Label id={id("width-label")}>{t("common.width")}</Label>
                <SearchableSelect
                  aria-labelledby={id("width-label")}
                  value={line.width}
                  onChange={(value) => patch(line.key, { width: value })}
                  options={WIDTH_CHOICES.map((width) => ({ value: width, label: width }))}
                  disabled={disabled}
                  allowCustom
                  placeholder={t("forms.choose")}
                  searchPlaceholder={t("quotations.widthOther")}
                  emptyText={t("forms.noMatch")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={id("length")}>{t("common.length")}</Label>
                <Input
                  id={id("length")}
                  required
                  disabled={disabled}
                  inputMode="decimal"
                  dir="ltr"
                  className="num text-start"
                  value={line.length}
                  onChange={(event) => patch(line.key, { length: event.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={id("qty")}>{t("common.qty")}</Label>
                <Input
                  id={id("qty")}
                  required
                  disabled={disabled}
                  inputMode="numeric"
                  dir="ltr"
                  className="num text-start"
                  value={line.qty}
                  onChange={(event) => patch(line.key, { qty: event.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={id("price")}>{t("common.pricePerSqm")}</Label>
                <Input
                  id={id("price")}
                  required
                  disabled={disabled}
                  inputMode="decimal"
                  dir="ltr"
                  className="num text-start"
                  value={line.pricePerSqm}
                  onChange={(event) => patch(line.key, { pricePerSqm: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2 text-sm">
              <span className="text-muted-foreground">
                {t("common.sqm")}{" "}
                <span dir="ltr" className="num font-medium text-foreground">
                  {formatSqm(sqm)}
                </span>
              </span>
              <span className="text-muted-foreground">
                {t("common.lineTotal")}{" "}
                <span dir="ltr" className="num font-medium text-foreground">
                  {formatMoney(total)}
                </span>{" "}
                {t("common.sar")}
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex">
        <Button type="button" variant="outline" disabled={disabled} onClick={add}>
          <Plus aria-hidden="true" />
          {t("quotations.addItem")}
        </Button>
      </div>
    </div>
  );
}
