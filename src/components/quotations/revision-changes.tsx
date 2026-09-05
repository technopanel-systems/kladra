import { getTranslations } from "next-intl/server";
import type { RevisionChanges as Changes } from "@/lib/quotations";
import type { LineChange } from "@/lib/quotation-diff";

/**
 * What this revision changed from the one before it (SPEC D76, 9A item 10).
 *
 * It sits directly above the lines, because it is what the coordinator reads
 * before she reads them: on Q-12/2 she already priced Q-12, and the only
 * question she has is which of these nine-field lines is not what she quoted.
 *
 * Old value beside new, never an arrow: an arrow is a left-to-right glyph and
 * this screen is read both ways. The new value sits where every value on this
 * drawer sits, after its label, and the old one is an aside behind it — she is
 * pricing the new one, and the old one is only there to say what moved.
 *
 * A changed figure is printed as it was typed, without the currency: the line is
 * about the number moving, and "138.00 — was 134.00" reads as one fact where two
 * currency codes would read as two amounts to add up.
 *
 * "Nothing changed on the lines" is printed rather than hidden. A revision with
 * the same lines is a real thing — the customer asked for the same panels on a
 * new paper — and a silent panel would read as one that failed to load.
 */
export async function RevisionChanges({ changes }: { changes: Changes }) {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t("quotations.changedFrom", { label: changes.label })}
      </h3>

      {changes.changes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("quotations.changedNothing")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {changes.changes.map((change) => (
            <li
              key={`${change.kind}-${change.position}-${change.colourCode}`}
              data-change={change.kind}
              className="flex flex-col gap-1 border-s-2 border-line ps-3 text-sm"
            >
              <Line change={change} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function Line({ change }: { change: LineChange }) {
  const t = await getTranslations();
  const item = t("quotations.itemNumber", { number: change.position });

  if (change.kind === "added") {
    return <span>{t("quotations.itemAdded", { item })}</span>;
  }
  if (change.kind === "removed") {
    return <span>{t("quotations.itemRemoved", { colour: change.colourCode })}</span>;
  }

  return (
    <>
      <span className="font-medium">{item}</span>
      {/* A label, its value, and what the value was — the same three-part shape
          every other figure on this drawer uses, rather than one sentence with
          two numbers in it. The value she is about to act on is the one in the
          reading colour; the old one is an aside beside it. */}
      <ul className="flex flex-col gap-0.5 text-xs">
        {change.fields.map((field) => (
          <li key={field.field} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted-foreground">{t(`common.${field.field}`)}</span>
            <span dir="auto">{field.to}</span>
            <span className="text-faint">{t("quotations.changedWas", { from: field.from })}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
