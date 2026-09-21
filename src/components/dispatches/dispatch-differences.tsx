import { getTranslations } from "next-intl/server";
import {
  differenceFieldLabel,
  differenceUnit,
  type Difference,
  type DifferenceField,
} from "@/lib/dispatch-difference";
import type { DispatchItemRow, DispatchServiceRow } from "@/lib/dispatches";
import { ToneNote } from "@/components/dispatches/tone-note";
import { formatNumber } from "@/lib/money";

/**
 * "Differs from Q-12" — what this load changed from the quotation it was
 * prefilled from, in words (SPEC §3, P13: "any difference from the quotation is
 * flagged on the dispatch for Rawan").
 *
 * On the drawer for everybody who can open it, above the actions, so the desk
 * reads it before she presses Approve and the rep reads what he sent. Under an
 * heading with the amber dot — somebody will look at this — and never the colour alone: the
 * heading says it, and every entry says what moved.
 *
 * The same three-part shape the revision's "what changed" uses, and for the same
 * reason (`revision-changes.tsx`): a label, the value the load carries, and what
 * the paper said, as an aside — never an arrow, which is a left-to-right glyph on
 * a screen read both ways. A line is named by its number, which on a load is the
 * quotation's own; an added line by its number and colour; a service by its name,
 * which is what a service is called on the paper.
 *
 * Nothing is drawn for a direct load or one that matched its paper: the flag is
 * the exception, and a section that says "nothing differs" on every ordinary load
 * would be one more thing to read past.
 */
export async function DispatchDifferences({
  label,
  difference,
  items,
  services,
  serviceNames,
  warehouseNames,
}: {
  /** Q-12 — the paper it differs from. */
  label: string | null;
  difference: readonly Difference[] | null;
  items: readonly DispatchItemRow[];
  services: readonly DispatchServiceRow[];
  /** Every service a recorded change names by id, in the reader's language. */
  serviceNames: Readonly<Record<string, string>>;
  /** And every store it names, the same way and for the same reason (P14). */
  warehouseNames: Readonly<Record<string, string>>;
}) {
  const t = await getTranslations();
  if (!label || !difference || difference.length === 0) return null;

  /**
   * The unit a figure is in, beside the figure itself (P13 review): "1.50 (was
   * 1.24)" asked the desk to remember whether that was metres, millimetres or a
   * price.
   *
   * It and the field's name live beside the rule they describe now
   * (src/lib/dispatch-difference.ts), because the dispatches file says the same
   * thing in one string and the two of them had drifted into two copies, one of
   * which was English (P14 14.10).
   */
  const unitOf = (field: DifferenceField) => differenceUnit(field, t);

  /** Figures as the screen writes them everywhere else, with their unit; a lookup as its word; a service and a store by name. */
  function shown(field: DifferenceField, value: string): { text: string; unit: string | null } {
    if (field === "service") return { text: serviceNames[value] ?? "", unit: null };
    // A list of stores reads as the names, in the one order the flag recorded
    // them, inside one run: the mark between them is neutral and belongs to the
    // list rather than to the sentence around it (rules/words.md).
    if (field === "warehouses") {
      const names = value.split(",").flatMap((store) => warehouseNames[store] ?? []);
      return { text: names.join(" · "), unit: null };
    }
    const unit = unitOf(field);
    if (field === "width" || field === "length" || field === "pricePerSqm" || field === "sqm") {
      return { text: formatNumber(value), unit };
    }
    return { text: value, unit };
  }

  /** The field's name, from the same place the file takes it (see above). */
  const fieldLabel = (field: DifferenceField) => differenceFieldLabel(field, t);

  // One entry per line or service, its changed fields together under it, in the
  // order the recorded list gives them — lines first, each in the load's order.
  const entries: { kind: Difference["kind"]; position: number; changes: Difference[] }[] = [];
  for (const change of difference) {
    // The load's own entry has no line number: it is one fact about the whole
    // thing, and it groups with nothing (P14).
    const position = change.kind === "load" ? 0 : change.position;
    const last = entries.at(-1);
    if (last && last.kind === change.kind && last.position === position) {
      last.changes.push(change);
    } else {
      entries.push({ kind: change.kind, position, changes: [change] });
    }
  }

  return (
    <section data-slot="differs" aria-labelledby="dispatch-differs-heading" className="card-face flex flex-col gap-2 p-3">
      {/* A title stays in the text colour and its tone is the dot before it
          (DESIGN §1 Stone): the amber heading was the loudest words on the drawer. */}
      <h3 id="dispatch-differs-heading" data-tone="wait" className="text-sm font-medium">
        <ToneNote tone="wait">{t("dispatches.differsFrom", { label })}</ToneNote>
      </h3>

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => {
          const item =
            entry.kind === "line" ? items.find((row) => row.position === entry.position) : undefined;
          const service =
            entry.kind === "service"
              ? services.find((row) => row.position === entry.position)
              : undefined;
          const added = entry.changes.some((change) => change.change === "added");

          return (
            <li
              key={`${entry.kind}-${entry.position}`}
              data-change={added ? "added" : "changed"}
              data-change-of={entry.kind}
              className="flex flex-col gap-1 border-s-2 border-line ps-3 text-sm"
            >
              {entry.kind === "line" && added ? (
                <span>
                  {t("dispatches.lineAdded", {
                    item: t("quotations.itemNumber", { number: entry.position }),
                    colour: item?.colourCode ?? "",
                  })}
                </span>
              ) : entry.kind === "service" && added ? (
                <span>
                  {t("dispatches.serviceAdded", {
                    service: service?.name ?? "",
                    sqm: formatNumber(service?.sqm ?? 0),
                  })}
                </span>
              ) : (
                <>
                  {/* The load's own change is not a line and wears no heading:
                      the field beneath it says "Store", which is the whole of
                      what there is to say (P14). */}
                  {entry.kind === "load" ? null : (
                    <span className="font-medium">
                      {entry.kind === "line" ? (
                        t("quotations.itemNumber", { number: entry.position })
                      ) : (
                        <bdi>{service?.name ?? ""}</bdi>
                      )}
                    </span>
                  )}
                  <ul className="flex flex-col gap-1 text-xs">
                    {entry.changes.flatMap((change) => {
                      if (change.change !== "changed") return [];
                      const to = shown(change.field, change.to);
                      const from = shown(change.field, change.from);
                      return [
                        <li
                          key={change.field}
                          data-field={change.field}
                          className="flex flex-wrap items-baseline gap-x-2"
                        >
                          <span className="text-muted-foreground">{fieldLabel(change.field)}</span>
                          {/* The value she acts on, then its unit, in the page's
                              order: the figure is its own left-to-right run and
                              the unit a word after it, which reads right in both
                              directions (rules/words.md). */}
                          <span className="whitespace-nowrap">
                            {to.unit ? (
                              <>
                                <span dir="ltr" className="num">
                                  {to.text}
                                </span>{" "}
                                {to.unit}
                              </>
                            ) : (
                              <bdi>{to.text}</bdi>
                            )}
                          </span>
                          <span className="text-faint">
                            {from.unit
                              ? t("dispatches.changedWasUnit", { from: from.text, unit: from.unit })
                              : t("quotations.changedWas", { from: from.text })}
                          </span>
                        </li>,
                      ];
                    })}
                  </ul>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
