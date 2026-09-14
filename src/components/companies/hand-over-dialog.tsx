"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { handOverCompanyAction } from "@/actions/companies";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { PickerOption } from "@/lib/picker-option";

/**
 * Give this customer to somebody else (P8.9).
 *
 * The manager's move (SPEC §3): a customer going to the rep who will work it,
 * or a floor surviving somebody who leaves. On a lead nobody has acknowledged
 * yet the action treats it as reassigning the lead (SPEC §3 P13).
 *
 * It is one item of the drawer's menu since P13-G6, beside Sharing — the pair
 * a reader compares, one moving the customer and the other not — so the drawer
 * hosts it and hands focus back to the menu's button when it closes. It sat
 * as a loose button against the rep's name before, which on a phone floated
 * alone at the far end of a line of its own.
 *
 * It is a confirmation with a question in it: the warning says what travels
 * with the company, and the confirm button is live from the start — pressing it
 * without choosing anybody is answered by the action, in a sentence (DESIGN §5).
 * The choice is cleared when the dialog closes, so opening it again never starts
 * on somebody the last person half-picked.
 */
export function HandOverDialog({
  companyId,
  companyName,
  people,
  open,
  onOpenChange,
}: {
  companyId: string;
  companyName: string;
  people: PickerOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [toId, setToId] = useState<string | null>(null);

  const chosen = people.find((person) => person.value === toId);

  return (
    <ConfirmDialog
      open={open}
      title={t("drawer.handOverTitle", { name: companyName })}
      description={t("drawer.handOverWarning")}
      confirmLabel={t("drawer.handOver")}
      successMessage={t("drawer.handedOver", {
        name: companyName,
        rep: chosen?.label ?? "",
      })}
      onOpenChange={(next) => {
        if (!next) setToId(null);
        onOpenChange(next);
      }}
      onConfirm={() => handOverCompanyAction(companyId, toId)}
      onDone={() => router.refresh()}
    >
      <div className="flex flex-col gap-2">
        <Label id={`${ids}-to`}>{t("drawer.handOverTo")}</Label>
        <SearchableSelect
          aria-labelledby={`${ids}-to`}
          value={toId}
          onChange={setToId}
          options={people}
          placeholder={t("drawer.handOverPick")}
          searchPlaceholder={t("drawer.handOverSearch")}
          emptyText={t("drawer.handOverNobody")}
        />
      </div>
    </ConfirmDialog>
  );
}
