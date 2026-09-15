"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QuotationLookups } from "@/actions/forms";
import { LineField, LineFields, LineFigure, LineItem } from "@/components/ui-ext/line-item";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LineRefusal } from "@/lib/line-refusal";
import { formatMoney, formatSqm, lineSqm, lineTotal } from "@/lib/money";
import type { DraftLine } from "@/lib/quotation-draft";
import { STANDARD_LENGTH, STANDARD_WIDTH, STANDARD_WIDTHS } from "@/lib/sheet";

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
 * Each line is an ITEM (`LineItem`, founder 2026-09-15): a card whose head says
 * "Item 2" and what it comes to — its m² as the figure, its money beside it — and
 * whose nine boxes sit in two rows that keep the founder's order and split it
 * where the sentence a rep says does: what the panel is (colour, supplier,
 * rating, class), then how many, on what sheet, at what price. It was a
 * thirteen-column table from `xl` with every label hidden under one row of
 * names, and it was reported three times as a stock form. Every label is drawn
 * at every width now, so no column has to be measured to fit a name: a row of
 * four and a row of five share the card, and a figure has the room it needs
 * (DESIGN §5: a figure that truncates is a different figure).
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
  refused,
}: {
  lookups: QuotationLookups;
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  disabled?: boolean;
  /**
   * The box the action refused, by the line's place in the list as it was sent
   * (src/lib/line-refusal.ts): marked `aria-invalid`, which is where the caret
   * goes, with the sentence under its line — so a blank box on the eighth of
   * twelve lines is found on the eighth line, not read for in the footer (D43).
   */
  refused?: LineRefusal | null;
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

  const choice = {
    disabled,
    placeholder: t("forms.choose"),
    searchPlaceholder: t("forms.searchList"),
    emptyText: t("forms.noMatch"),
  };

  return (
    <div className="flex flex-col gap-3">
      <div data-slot="quotation-lines" className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const id = (fieldName: string) => `${line.key}-${fieldName}`;
          const refusedHere = refused?.index === index ? refused : null;
          const refusedBox = (name: string) => refusedHere?.field === name;
          const describedBy = (name: string) => (refusedBox(name) ? id("refused") : undefined);

          return (
            <LineItem
              key={line.key}
              // Named so a walk can read the nine boxes in the order they are
              // drawn: the founder's order is a decision (§3) and an order nothing
              // checks is an order that drifts back (P12-9).
              data-slot="quotation-line"
              heading={t("quotations.itemNumber", { number: index + 1 })}
              figures={
                <>
                  <LineFigure strong value={formatSqm(lineSqm(line))} unit={t("common.sqm")} />
                  <LineFigure
                    label={t("common.lineTotal")}
                    value={formatMoney(lineTotal(line))}
                    unit={t("common.sar")}
                  />
                </>
              }
              // The only line cannot be removed: a quotation with no lines is
              // not a quotation, and a button that refuses on press is the dead
              // control this app does not ship (DESIGN §5).
              onRemove={lines.length > 1 ? () => remove(line.key) : undefined}
              removeLabel={t("quotations.removeItem")}
              disabled={disabled}
              alert={
                refusedHere ? (
                  <p id={id("refused")} role="alert" className="text-xs text-destructive">
                    {refusedHere.message}
                  </p>
                ) : null
              }
            >
              {/* What the panel is. */}
              <LineFields cols={4}>
                <LineField label={t("common.colourCode")} htmlFor={id("colour")}>
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
                    value={line.colourCode}
                    onChange={(event) => patch(line.key, { colourCode: event.target.value })}
                    aria-invalid={refusedBox("colourCode") || undefined}
                    aria-describedby={describedBy("colourCode")}
                    placeholder={t("quotations.colourPlaceholder")}
                  />
                </LineField>
                <LineField label={t("common.supplier")} labelId={id("supplier-label")}>
                  <SearchableSelect
                    {...choice}
                    aria-labelledby={id("supplier-label")}
                    value={line.supplierId}
                    onChange={(value) => patch(line.key, { supplierId: value })}
                    options={lookups.suppliers}
                    invalid={refusedBox("supplierId") || undefined}
                    aria-describedby={describedBy("supplierId")}
                  />
                </LineField>
                <LineField label={t("common.fireRating")} labelId={id("fire-label")}>
                  <SearchableSelect
                    {...choice}
                    aria-labelledby={id("fire-label")}
                    value={line.fireRatingId}
                    onChange={(value) => patch(line.key, { fireRatingId: value })}
                    options={lookups.fireRatings}
                    invalid={refusedBox("fireRatingId") || undefined}
                    aria-describedby={describedBy("fireRatingId")}
                  />
                </LineField>
                <LineField label={t("common.class")} labelId={id("class-label")}>
                  <SearchableSelect
                    {...choice}
                    aria-labelledby={id("class-label")}
                    value={line.classId}
                    onChange={(value) => patch(line.key, { classId: value })}
                    options={lookups.classes}
                    invalid={refusedBox("classId") || undefined}
                    aria-describedby={describedBy("classId")}
                  />
                </LineField>
              </LineFields>

              {/* How many, on what sheet, at what price. */}
              <LineFields cols={5}>
                <LineField label={t("common.qty")} htmlFor={id("qty")}>
                  <Input
                    id={id("qty")}
                    required
                    disabled={disabled}
                    inputMode="numeric"
                    dir="ltr"
                    className="num text-start rtl:text-end"
                    value={line.qty}
                    onChange={(event) => patch(line.key, { qty: event.target.value })}
                    aria-invalid={refusedBox("qty") || undefined}
                    aria-describedby={describedBy("qty")}
                  />
                </LineField>
                <LineField label={t("common.thickness")} labelId={id("thickness-label")}>
                  <SearchableSelect
                    {...choice}
                    aria-labelledby={id("thickness-label")}
                    value={line.thicknessId}
                    onChange={(value) => patch(line.key, { thicknessId: value })}
                    options={lookups.thicknesses}
                    invalid={refusedBox("thicknessId") || undefined}
                    aria-describedby={describedBy("thicknessId")}
                  />
                </LineField>
                <LineField label={t("common.width")} labelId={id("width-label")}>
                  <SearchableSelect
                    {...choice}
                    aria-labelledby={id("width-label")}
                    value={line.width}
                    onChange={(value) => patch(line.key, { width: value })}
                    options={STANDARD_WIDTHS.map((width) => ({ value: width, label: width }))}
                    invalid={refusedBox("width") || undefined}
                    aria-describedby={describedBy("width")}
                    allowCustom
                    searchPlaceholder={t("quotations.widthOther")}
                  />
                </LineField>
                <LineField label={t("common.length")} htmlFor={id("length")}>
                  <Input
                    id={id("length")}
                    required
                    disabled={disabled}
                    inputMode="decimal"
                    dir="ltr"
                    className="num text-start rtl:text-end"
                    value={line.length}
                    onChange={(event) => patch(line.key, { length: event.target.value })}
                    aria-invalid={refusedBox("length") || undefined}
                    aria-describedby={describedBy("length")}
                  />
                </LineField>
                <LineField label={t("common.pricePerSqm")} htmlFor={id("price")}>
                  <Input
                    id={id("price")}
                    required
                    disabled={disabled}
                    inputMode="decimal"
                    dir="ltr"
                    className="num text-start rtl:text-end"
                    value={line.pricePerSqm}
                    onChange={(event) => patch(line.key, { pricePerSqm: event.target.value })}
                    aria-invalid={refusedBox("pricePerSqm") || undefined}
                    aria-describedby={describedBy("pricePerSqm")}
                  />
                </LineField>
              </LineFields>
            </LineItem>
          );
        })}
      </div>

      {/* A refusal about a line he has since taken off is still said. */}
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
