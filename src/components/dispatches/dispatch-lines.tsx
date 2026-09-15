"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QuotationLookups } from "@/actions/forms";
import { nextLine, type LineDraft } from "@/components/quotations/quotation-lines";
import { LineField, LineFields, LineFigure, LineItem } from "@/components/ui-ext/line-item";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LineRefusal } from "@/lib/line-refusal";
import { formatMoney, formatSqm, lineSqm, lineTotal, toNumber } from "@/lib/money";
import { STANDARD_WIDTHS } from "@/lib/sheet";

/**
 * The lines of a load, as a rep sends them (SPEC §3, P13).
 *
 * A dispatch carries the same nine inputs as a quotation's line, in the founder's
 * order — Colour code · Supplier · Fire rating · Class · Qty · Thickness · Width ·
 * Length · Price per m² — because it is the same sheet going out, and the rep may
 * change any of them for this load: a length cut on site, a colour the store is
 * out of, a price agreed on the phone. Laid out the way the quotation's lines are
 * (`quotation-lines.tsx`).
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
 *
 * Laid out as items (`LineItem`, founder 2026-09-15), as the quotation's are: a
 * card per line with its number and what it comes to at its head, the nine boxes
 * in two labelled rows, and what is left to send written under the count it
 * limits rather than in a column of its own.
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
  const numbers = lineNumbers(lines, carried, base);

  function patch(key: string, change: Partial<LoadDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  function add() {
    // The sheet of the line above, and nothing else — never its colour or its
    // price (D163) — and never a link to the paper: an added line is not on it.
    onChange([...lines, { ...nextLine(lookups, lines.at(-1)), quotationItemId: null }]);
  }

  const choice = {
    disabled,
    placeholder: t("forms.choose"),
    searchPlaceholder: t("forms.searchList"),
    emptyText: t("forms.noMatch"),
  };

  return (
    <div className="flex flex-col gap-3">
      <div data-slot="dispatch-lines" className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const id = (fieldName: string) => `${line.key}-${fieldName}`;
          const facts = line.quotationItemId ? carried.get(line.quotationItemId) : undefined;
          const number = numbers[index];
          const overspent = facts !== undefined && toNumber(line.qty) > facts.left;
          const refusedHere = refused?.index === index ? refused : null;
          // The box the action named is the one that says it is wrong (D43).
          const refusedBox = (name: string) => refusedHere?.field === name;

          return (
            <LineItem
              key={line.key}
              data-slot="dispatch-line"
              data-carried={facts ? "true" : "false"}
              data-position={number}
              heading={t("quotations.itemNumber", { number })}
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
              // The only line cannot be removed: a load with no panels on it is
              // not a load, and a button that refuses on press is the dead
              // control this app does not ship (DESIGN §5).
              onRemove={
                lines.length > 1 ? () => onChange(lines.filter((row) => row.key !== line.key)) : undefined
              }
              removeLabel={t("quotations.removeItem")}
              disabled={disabled}
              alert={
                // Said at the field, in the app's own words, the moment it is
                // true — not held back until Save (DESIGN §5).
                overspent ? (
                  <p id={id("too-much")} role="alert" className="text-xs text-destructive">
                    {t("dispatches.tooMuch")}
                  </p>
                ) : refusedHere ? (
                  // What the action refused on this line, under it (D43).
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
                    // A code, typed in whichever script: it runs the way its
                    // first letter does.
                    dir="auto"
                    value={line.colourCode}
                    onChange={(event) => patch(line.key, { colourCode: event.target.value })}
                    aria-invalid={refusedBox("colourCode") || undefined}
                    aria-describedby={refusedBox("colourCode") ? id("refused") : undefined}
                  />
                </LineField>
                {(
                  [
                    ["supplier", "supplierId", "common.supplier", lookups.suppliers],
                    ["fire", "fireRatingId", "common.fireRating", lookups.fireRatings],
                    ["class", "classId", "common.class", lookups.classes],
                  ] as const
                ).map(([slot, key, label, options]) => (
                  <LineField key={slot} label={t(label)} labelId={id(`${slot}-label`)}>
                    <SearchableSelect
                      {...choice}
                      aria-labelledby={id(`${slot}-label`)}
                      value={line[key]}
                      onChange={(value) => patch(line.key, { [key]: value })}
                      options={options}
                      invalid={refusedBox(key) || undefined}
                      aria-describedby={refusedBox(key) ? id("refused") : undefined}
                    />
                  </LineField>
                ))}
              </LineFields>

              {/* How many go on this load, on what sheet, at what price — and,
                  under the count, what the paper has left, which is the one
                  figure a rep cannot work out in his head (D12). */}
              <LineFields cols={5}>
                <LineField
                  label={t("dispatches.sending")}
                  htmlFor={id("qty")}
                  hint={
                    paper ? (
                      <p data-slot="line-left" className="text-xs text-muted-foreground">
                        {facts ? (
                          <>
                            {t("dispatches.remaining")}{" "}
                            <span dir="ltr" data-slot="figure-left" className="num font-medium text-foreground">
                              {facts.left}
                            </span>
                          </>
                        ) : (
                          t("dispatches.notOnPaper")
                        )}
                      </p>
                    ) : null
                  }
                >
                  <Input
                    id={id("qty")}
                    required
                    disabled={disabled}
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="off"
                    className="num text-start rtl:text-end"
                    value={line.qty}
                    onChange={(event) => patch(line.key, { qty: event.target.value })}
                    aria-invalid={overspent || refusedBox("qty") || undefined}
                    aria-describedby={
                      overspent ? id("too-much") : refusedBox("qty") ? id("refused") : undefined
                    }
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
                    aria-describedby={refusedBox("thicknessId") ? id("refused") : undefined}
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
                    aria-describedby={refusedBox("width") ? id("refused") : undefined}
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
                    autoComplete="off"
                    className="num text-start rtl:text-end"
                    value={line.length}
                    onChange={(event) => patch(line.key, { length: event.target.value })}
                    aria-invalid={refusedBox("length") || undefined}
                    aria-describedby={refusedBox("length") ? id("refused") : undefined}
                  />
                </LineField>
                <LineField label={t("common.pricePerSqm")} htmlFor={id("price")}>
                  <Input
                    id={id("price")}
                    required
                    disabled={disabled}
                    inputMode="decimal"
                    dir="ltr"
                    autoComplete="off"
                    className="num text-start rtl:text-end"
                    value={line.pricePerSqm}
                    onChange={(event) => patch(line.key, { pricePerSqm: event.target.value })}
                    aria-invalid={refusedBox("pricePerSqm") || undefined}
                    aria-describedby={refusedBox("pricePerSqm") ? id("refused") : undefined}
                  />
                </LineField>
              </LineFields>
            </LineItem>
          );
        })}
      </div>

      {/* A refusal about a line that is no longer on the form — he took it off
          after Save — is still said, under the items. */}
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
