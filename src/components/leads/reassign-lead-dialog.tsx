"use client";

import { useId, useState } from "react";
import { UserRoundPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { reassignLeadAction } from "@/actions/companies";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { PickerOption } from "@/lib/picker-option";
import { cn } from "@/lib/utils";

/**
 * Give this lead to somebody else, from its row (SPEC §3 P13: "The manager's
 * leads view assigns and reassigns").
 *
 * The hand-over's own shape — a confirmation with the question "who" inside it
 * (`ConfirmDialog`), the picker of everybody a company can sit with, the confirm
 * live from the start and answered by the action in a sentence when nobody was
 * chosen (DESIGN §5) — because it IS a hand-over of a company that happens to be
 * a lead (D156, D157). What the warning says is what differs: the new holder is
 * told, and it waits in his band until he acknowledges it.
 *
 * Offered to whoever `mayHandOver` says yes to, which is the manager and the
 * admin and nobody viewing as somebody; the page decides and the action asks
 * again.
 */
export function ReassignLeadDialog({
  companyId,
  companyName,
  holderId,
  people,
  reveal = false,
}: {
  companyId: string;
  companyName: string;
  /** Who has it now — left off the picker, since giving it to him moves nothing. */
  holderId: string;
  people: PickerOption[];
  /** On a desk row: drawn when the row is hovered or focused (DESIGN §1b). */
  reveal?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [toId, setToId] = useState<string | null>(null);

  const options = people.filter((person) => person.value !== holderId);
  const chosen = options.find((person) => person.value === toId);

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          data-slot="reassign-lead"
          className={cn("text-muted-foreground", reveal && "reveal")}
        >
          <UserRoundPlus aria-hidden="true" />
          {t("leads.reassign")}
          <span className="sr-only">
            {" "}
            <bdi>{companyName}</bdi>
          </span>
        </Button>
      }
      title={t("leads.reassignTitle", { name: companyName })}
      description={t("leads.reassignWarning")}
      confirmLabel={t("leads.reassign")}
      successMessage={t("leads.filed", { name: companyName, rep: chosen?.label ?? "" })}
      onOpenChange={(open) => {
        if (!open) setToId(null);
      }}
      onConfirm={() => reassignLeadAction(companyId, toId)}
      onDone={() => router.refresh()}
    >
      <div className="flex flex-col gap-2">
        <Label id={`${ids}-to`}>{t("leads.giveTo")}</Label>
        <SearchableSelect
          aria-labelledby={`${ids}-to`}
          value={toId}
          onChange={setToId}
          options={options}
          placeholder={t("drawer.handOverPick")}
          searchPlaceholder={t("drawer.handOverSearch")}
          emptyText={t("drawer.handOverNobody")}
        />
      </div>
    </ConfirmDialog>
  );
}
