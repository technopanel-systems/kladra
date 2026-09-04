"use client";

import { useTranslations } from "next-intl";
import type { RemainingItem } from "@/lib/dispatches";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSqm, lineSqm, round2, toNumber } from "@/lib/money";

/**
 * Which lines of a quotation are going now, and how many of each (SPEC §3, S37).
 *
 * Every line of the quotation is listed, whether or not anything is left on it,
 * with one box: how many go this time. A line left at zero is not an error and
 * is not sent — it is how a rep says "not this one", which is the normal case,
 * because cladding is taken in stages and a dispatch is usually part of a
 * quotation rather than all of it.
 *
 * Each line says what was quoted and what is still left to send, because the
 * one number a rep cannot work out in his head is the second one — it depends
 * on every dispatch anybody has raised against that line, including requests
 * still sitting on the coordinator's desk (D12).
 *
 * The m² appears as he types, on this line and in the total underneath, for the
 * same reason as the quotation's totals: a figure he watches add up is a figure
 * he stops re-checking on his phone (S31).
 */

export type SendDraft = {
  quotationItemId: string;
  /** As typed. A string, because that is what came out of a text box. */
  qty: string;
};

/** What the hidden `items` field carries to the action. */
export function itemsPayload(lines: SendDraft[]): string {
  return JSON.stringify(
    lines.map((line) => ({
      quotationItemId: line.quotationItemId,
      qty: line.qty.trim() === "" ? 0 : Number(line.qty),
    })),
  );
}

/**
 * The m² of the whole request, rounded per line then summed — the same shape as
 * the quotation's totals and the same shape as the SQL in `src/lib/dispatches.ts`.
 * `lineSqm` is the one arithmetic both sides use (money.ts).
 */
export function sendingSqm(items: RemainingItem[], lines: SendDraft[]): number {
  const byId = new Map(items.map((item) => [item.quotationItemId, item]));
  return round2(
    lines.reduce((sum, line) => {
      const item = byId.get(line.quotationItemId);
      if (!item) return sum;
      return sum + lineSqm({ width: item.width, length: item.length, qty: line.qty });
    }, 0),
  );
}

export function DispatchItems({
  items,
  lines,
  onChange,
  disabled,
}: {
  items: RemainingItem[];
  lines: SendDraft[];
  onChange: (lines: SendDraft[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();

  function patch(quotationItemId: string, qty: string) {
    onChange(
      lines.map((line) => (line.quotationItemId === quotationItemId ? { ...line, qty } : line)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const line = lines.find((row) => row.quotationItemId === item.quotationItemId);
        const qty = toNumber(line?.qty);
        const id = `send-${item.quotationItemId}`;
        const overspent = qty > item.remainingQty;

        return (
          <div key={item.quotationItemId} className="card-face flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-medium">
                {t("quotations.itemNumber", { number: item.position })}
                {" · "}
                <span dir="ltr" className="num">
                  {item.colourCode}
                </span>
              </h4>
              <span className="text-xs text-muted-foreground">
                {t("common.sqm")}{" "}
                <span dir="ltr" className="num">
                  {formatSqm(lineSqm({ width: item.width, length: item.length, qty }))}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-3 items-end gap-3">
              <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {t("dispatches.quoted")}
                <span dir="ltr" className="num text-sm text-foreground">
                  {item.quotedQty}
                </span>
              </span>
              <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {t("dispatches.remaining")}
                <span dir="ltr" className="num text-sm text-foreground">
                  {item.remainingQty}
                </span>
              </span>
              <span className="flex flex-col gap-1.5">
                <Label htmlFor={id} className="text-xs">
                  {t("dispatches.sending")}
                </Label>
                <Input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  className="num"
                  disabled={disabled || item.remainingQty === 0}
                  value={line?.qty ?? ""}
                  onChange={(event) => patch(item.quotationItemId, event.target.value)}
                  aria-invalid={overspent || undefined}
                  placeholder="0"
                />
              </span>
            </div>

            {item.remainingQty === 0 ? (
              <p className="text-xs text-muted-foreground">{t("dispatches.nothingLeft")}</p>
            ) : overspent ? (
              // Said at the field, in the app's own words, the moment it is
              // true — not held back until Save (DESIGN §5).
              <p role="alert" className="text-xs text-destructive">
                {t("dispatches.tooMuch")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
