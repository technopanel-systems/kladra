"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { SearchableSelect, type SelectOption } from "@/components/ui-ext/searchable-select";
import { Label } from "@/components/ui/label";
import { RAISED_FOR_NOBODY, type RaisedForPerson } from "@/lib/on-behalf-option";
import type { ActionResult } from "@/lib/types";

/**
 * "For" — the first field of both request dialogs, for the coordinator alone
 * (SPEC §3 P13): whom the paper counts for. Every active rep and marketing
 * person, and "Nobody — Internal Sales" pinned above them, which is her own.
 *
 * One component for the two dialogs, so a quotation and a dispatch cannot ask
 * the question two ways. It offers only the answers the dialog found eligible —
 * on a quotation's drawer, the people who may send against that paper — so a
 * name the action would refuse is never a name she can pick.
 */
export function RaisedForField({
  people,
  eligible,
  value,
  onChange,
  disabled,
  error,
}: {
  people: RaisedForPerson[];
  /** The answers this door allows, `RAISED_FOR_NOBODY` among them when hers is one. */
  eligible: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The action's sentence about the person chosen. */
  error?: string;
}) {
  const t = useTranslations();
  const allowed = new Set(eligible);
  const options: SelectOption[] = [
    { value: RAISED_FOR_NOBODY, label: t("common.onBehalf.nobody"), pinned: true },
    ...people,
  ].filter((option) => allowed.has(option.value));

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id="raised-for-label">{t("common.onBehalf.for")}</Label>
      <SearchableSelect
        aria-labelledby="raised-for-label"
        aria-describedby={error ? "raised-for-error" : undefined}
        invalid={error ? true : undefined}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={t("forms.choose")}
        searchPlaceholder={t("forms.searchList")}
        emptyText={t("forms.noMatch")}
      />
      {error ? (
        <p id="raised-for-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The "For" field's answers, asked when the dialog opens and only where it
 * could be hers to ask (`enabled`).
 *
 * - `null`: nobody to ask — the field is not drawn. Everybody who is not the
 *   coordinator gets this, from the action as well as from `enabled`.
 * - `undefined`: on its way; the dialog draws its skeleton, because a form that
 *   grows a first field after it is read moves every field under the caret.
 * - `"failed"`: the lists did not load. Not a courtesy read — who a paper counts
 *   for is the first question on the form, and quietly skipping it would write
 *   her paper as Internal Sales.
 *
 * The answer carries the key it was read for (the quotation a dispatch dialog
 * is opened on), and is compared rather than reset, as the dialogs' other
 * reads are. A failed refresh keeps the answer the form may be open on.
 */
export function useOnBehalf<T>(
  enabled: boolean,
  key: string,
  read: () => Promise<ActionResult<T | null>>,
): T | null | "failed" | undefined {
  const guarded = useWireGuard();
  // Read through a ref so a new closure every render does not read again.
  const reader = useRef(read);
  useEffect(() => {
    reader.current = read;
  });
  const [answer, setAnswer] = useState<{ key: string; value: T | null | "failed" } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    guarded(() => reader.current())().then((outcome) => {
      if (cancelled) return;
      setAnswer((had) =>
        outcome.ok
          ? { key, value: outcome.data ?? null }
          : had?.key === key && had.value !== "failed"
            ? had
            : { key, value: "failed" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, guarded]);

  if (!enabled) return null;
  return answer?.key === key ? answer.value : undefined;
}
