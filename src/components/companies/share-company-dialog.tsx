"use client";

import { useCallback, useId, useState } from "react";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { shareCompanyAction, unshareCompanyAction } from "@/actions/shares";
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { PickerOption } from "@/lib/picker-option";
import type { Sharer } from "@/lib/shares";
import type { ActionResult } from "@/lib/types";

/**
 * Who else is on this customer, and the two ways to change it (SPEC §3, D147).
 *
 * One dialog, not two, because "who else is on this" is one question and a
 * person opens it to answer it: he reads the names already there, takes one
 * off, or puts one on. Two dialogs would make him open the second to find out
 * whether the first was needed.
 *
 * A company shared is a company SEEN. Everybody on the list reads the company
 * and everything under it and keeps his own contacts on it; nobody else works
 * it, nothing moves, and the metres stay where they were — which is the whole
 * difference from Hand over, the control sitting next to this one, and why the
 * description says it in words rather than leaving it to be discovered.
 *
 * The picker is rendered in ONE position whatever the list above it says
 * (D35): inside the empty state it would be destroyed by the very add that
 * fills the list, and the toast that says it worked would go with it.
 *
 * It has a second, smaller shape. A person who was PUT on a customer may
 * always take himself off (D147) and may do nothing else about the list, so
 * what he opens is a confirmation rather than a panel: one question, one
 * answer, and the names are already in the line behind it. Rendering him a
 * panel with a picker he cannot use, or a footer whose Save saves nothing,
 * would be a screen offering work that is not there (DESIGN §5).
 */
export function ShareCompanyDialog({
  companyId,
  companyName,
  sharers,
  people,
  me,
}: {
  companyId: string;
  companyName: string;
  /** Who is on it now, in the reader's language, without its own rep. */
  sharers: Sharer[];
  /**
   * Who can still be put on it: everybody who holds a floor, minus its rep and
   * minus everybody already on it — so the list never offers a share the
   * action would refuse (DESIGN §5). Null for a reader who may not grant one.
   */
  people: PickerOption[] | null;
  /** The reader, so the row that is his own knows that it is. */
  me: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button type="button" variant="ghost" size="sm" className="ms-auto text-muted-foreground">
      <UsersRound aria-hidden="true" />
      {t("drawer.share.action")}
    </Button>
  );

  if (people === null) {
    // Neither grants nor is on it: the header says who is, in words, and there
    // is nothing here to press.
    if (!sharers.some((person) => person.id === me)) return null;
    return (
      <ConfirmDialog
        trigger={trigger}
        title={t("drawer.share.leaveTitle", { name: companyName })}
        description={t("drawer.share.leaveCompanyWarning")}
        confirmLabel={t("drawer.share.leave")}
        successMessage={t("drawer.share.left", { label: companyName })}
        onConfirm={() => unshareCompanyAction(companyId, me)}
        onDone={() => router.refresh()}
      />
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={t("drawer.share.companyTitle")}
      context={companyName}
      description={t("drawer.share.companyMeans")}
    >
      <ShareCompanyBody
        companyId={companyId}
        companyName={companyName}
        sharers={sharers}
        people={people}
        onClose={() => setOpen(false)}
      />
    </ResponsiveDialog>
  );
}

function ShareCompanyBody({
  companyId,
  companyName,
  sharers,
  people,
  onClose,
}: {
  companyId: string;
  companyName: string;
  sharers: Sharer[];
  people: PickerOption[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [toId, setToId] = useState<string | null>(null);

  const chosen = people.find((person) => person.value === toId) ?? null;

  // The action takes two ids; the form carries the second one. Wrapped rather
  // than passed straight through, because `useSubmitAction` hands an action
  // (previous answer, FormData) and this one wants the company it was opened on.
  const add = useCallback(
    (_previous: ActionResult | null, form: FormData) =>
      shareCompanyAction(companyId, form.get("userId")),
    [companyId],
  );

  // Awaited and answered on directly (D35): the add closes this dialog, so an
  // effect belonging to it would never run.
  const { submit, pending, error } = useSubmitAction(add, () => {
    toast.success(
      t("drawer.share.added", { name: chosen?.label ?? "", label: companyName }),
    );
    setToId(null);
    onClose();
    router.refresh();
  });

  return (
    /* A form, so Enter adds (D114). The confirmations inside it are portalled
       out of this element and stop their own submit at themselves, so every
       button in the list says `type="button"` and nothing else reaches here. */
    <form action={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="userId" value={toId ?? ""} />

      <FormBody>
        {sharers.length === 0 ? (
          // One sentence, not an empty box (D23, D31, DESIGN §5). The thing to
          // do about it is the picker below, which is there either way.
          <p className="text-sm text-muted-foreground">{t("drawer.share.companyNobody")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sharers.map((person) => (
              <li key={person.id} className="card-face flex items-center gap-3 p-3">
                {/* A name is a run of its own script inside a line that runs the
                    page's way (rules/words.md). */}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  <bdi>{person.name}</bdi>
                </span>
                {/* Taking somebody off is a change to a permission, so it asks
                    first — the same confirmation archiving uses, not a second
                    one that disagrees about how big the change is. */}
                <ConfirmDialog
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                    >
                      {t("drawer.share.remove")}
                    </Button>
                  }
                  title={t("drawer.share.removeCompanyTitle", { name: person.name })}
                  description={t("drawer.share.removeCompanyWarning")}
                  confirmLabel={t("drawer.share.remove")}
                  successMessage={t("drawer.share.removed", {
                    name: person.name,
                    label: companyName,
                  })}
                  onConfirm={() => unshareCompanyAction(companyId, person.id)}
                  // This dialog stays open on the row that has just gone: the
                  // list is re-read from the server and the answer to "who else
                  // is on this" is visible where it was asked.
                  onDone={() => router.refresh()}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <Label id={`${ids}-who`}>{t("drawer.share.companyWho")}</Label>
          <SearchableSelect
            aria-labelledby={`${ids}-who`}
            value={toId}
            onChange={setToId}
            options={people}
            disabled={pending}
            placeholder={t("forms.choose")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("drawer.share.nobodyLeft")}
          />
        </div>
      </FormBody>

      {/* Add is live before anybody is chosen, like every primary action here;
          pressing it early is answered by the action's own sentence, under the
          one box this form has (D43, DESIGN §5). */}
      <FormFooter
        error={error}
        pending={pending}
        onCancel={onClose}
        confirmLabel={t("drawer.share.add")}
      />
    </form>
  );
}
