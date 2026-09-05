"use client";

import { useId, useState } from "react";
import { UserRoundPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { handOverCompanyAction } from "@/actions/companies";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { PickerOption } from "@/lib/picker-option";

/**
 * Give this customer to somebody else (P8.9).
 *
 * The move marketing exists for — it finds a company, works it, and hands it to
 * the rep who will price it — and the one the manager makes when somebody
 * leaves. It sits beside the rep's name rather than in the row of buttons
 * below, because it changes that name and nothing else on the screen.
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
}: {
  companyId: string;
  companyName: string;
  people: PickerOption[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [toId, setToId] = useState<string | null>(null);

  const chosen = people.find((person) => person.value === toId);

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="ms-auto text-muted-foreground">
          <UserRoundPlus aria-hidden="true" />
          {t("drawer.handOver")}
        </Button>
      }
      title={t("drawer.handOverTitle", { name: companyName })}
      description={t("drawer.handOverWarning")}
      confirmLabel={t("drawer.handOver")}
      successMessage={t("drawer.handedOver", {
        name: companyName,
        rep: chosen?.label ?? "",
      })}
      onOpenChange={(open) => {
        if (!open) setToId(null);
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
