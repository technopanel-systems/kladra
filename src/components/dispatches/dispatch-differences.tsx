import { getTranslations } from "next-intl/server";
import type { Difference, DifferenceField } from "@/lib/dispatch-difference";
import type { DispatchItemRow, DispatchServiceRow } from "@/lib/dispatches";
import { formatNumber } from "@/lib/money";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * "Differs from Q-12" — what this load changed from the quotation it was
 * prefilled from, in words (SPEC §3, P13: "any difference from the quotation is
 * flagged on the dispatch for Rawan").
 *
 * On the drawer for everybody who can open it, above the actions, so the desk
 * reads it before she presses Approve and the rep reads what he sent. Under an
 * amber heading — somebody will look at this — and never the colour alone: the
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
}: {
  /** Q-12 — the paper it differs from. */
  label: string | null;
  difference: readonly Difference[] | null;
  items: readonly DispatchItemRow[];
  services: readonly DispatchServiceRow[];
  /** Every service a recorded change names by id, in the reader's language. */
  serviceNames: Readonly<Record<string, string>>;
}) {
  const t = await getTranslations();
  if (!label || !difference || difference.length === 0) return null;

  /** Figures as the screen writes them everywhere else; a lookup as its word; a service by name. */
  function shown(field: DifferenceField, value: string): { text: string; figure: boolean } {
    if (field === "service") return { text: serviceNames[value] ?? "", figure: false };
    if (field === "width" || field === "length" || field === "pricePerSqm" || field === "sqm") {
      return { text: formatNumber(value), figure: true };
    }
    return { text: value, figure: false };
  }

  function fieldLabel(field: DifferenceField): string {
    if (field === "service") return t("quotations.service");
    if (field === "sqm") return t("common.sqm");
    return t(`common.${field}`);
  }

  // One entry per line or service, its changed fields together under it, in the
  // order the recorded list gives them — lines first, each in the load's order.
  const entries: { kind: Difference["kind"]; position: number; changes: Difference[] }[] = [];
  for (const change of difference) {
    const last = entries.at(-1);
    if (last && last.kind === change.kind && last.position === change.position) {
      last.changes.push(change);
    } else {
      entries.push({ kind: change.kind, position: change.position, changes: [change] });
    }
  }

  return (
    <section data-slot="differs" aria-labelledby="dispatch-differs-heading" className="card-face flex flex-col gap-2 p-3">
      <h3
        id="dispatch-differs-heading"
        data-tone="wait"
        className={cn("text-sm font-medium", TONE_TEXT.wait)}
      >
        {t("dispatches.differsFrom", { label })}
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
                  <span className="font-medium">
                    {entry.kind === "line" ? (
                      t("quotations.itemNumber", { number: entry.position })
                    ) : (
                      <bdi>{service?.name ?? ""}</bdi>
                    )}
                  </span>
                  <ul className="flex flex-col gap-0.5 text-xs">
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
                          {to.figure ? (
                            <span dir="ltr" className="num">
                              {to.text}
                            </span>
                          ) : (
                            <bdi>{to.text}</bdi>
                          )}
                          <span className="text-faint">
                            {t("quotations.changedWas", { from: from.text })}
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
