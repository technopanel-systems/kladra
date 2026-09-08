"use client";

import { useCallback, useId, useState } from "react";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { shareProjectAction, unshareProjectAction } from "@/actions/shares";
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
 * Who else is on this job (SPEC §3, D147). The company's dialog one level
 * down, and deliberately the same shape — the question is the same question,
 * and a person who has answered it once on a customer should not have to learn
 * a second screen to answer it on a project.
 *
 * What it grants is not the same, and that is what the description says. A
 * company shared is a company SEEN; a project shared is a project WORKED —
 * everybody on it logs against it, reports on it and raises quotations and
 * dispatches on it. What he raises is his own, and the project row itself
 * stays with whoever added it.
 *
 * Putting somebody on a project puts him on its company too, because a job he
 * could work on a customer he could not open would be a permission pointing at
 * nothing; the action does that in the same transaction, so the dialog does not
 * ask twice. Taking him off again does NOT take the company back: he was
 * reading the customer before this job, and that is its own decision.
 *
 * The second, smaller shape is the company dialog's: a person who was PUT on a
 * job may always take himself off it (D147) and may do nothing else about the
 * list, so what he opens is a confirmation rather than a panel.
 */
export function ShareProjectDialog({
  projectId,
  projectName,
  sharers,
  people,
  me,
}: {
  projectId: string;
  projectName: string;
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
    // Neither grants nor is on it: the drawer says who is, in words, and there
    // is nothing here to press.
    if (!sharers.some((person) => person.id === me)) return null;
    return (
      <ConfirmDialog
        trigger={trigger}
        title={t("drawer.share.leaveTitle", { name: projectName })}
        description={t("drawer.share.leaveProjectWarning")}
        confirmLabel={t("drawer.share.leave")}
        successMessage={t("drawer.share.left", { label: projectName })}
        onConfirm={() => unshareProjectAction(projectId, me)}
        onDone={() => router.refresh()}
      />
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={t("drawer.share.projectTitle")}
      context={projectName}
      description={t("drawer.share.projectMeans")}
    >
      <ShareProjectBody
        projectId={projectId}
        projectName={projectName}
        sharers={sharers}
        people={people}
        onClose={() => setOpen(false)}
      />
    </ResponsiveDialog>
  );
}

function ShareProjectBody({
  projectId,
  projectName,
  sharers,
  people,
  onClose,
}: {
  projectId: string;
  projectName: string;
  sharers: Sharer[];
  people: PickerOption[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [toId, setToId] = useState<string | null>(null);

  const chosen = people.find((person) => person.value === toId) ?? null;

  const add = useCallback(
    (_previous: ActionResult | null, form: FormData) =>
      shareProjectAction(projectId, form.get("userId")),
    [projectId],
  );

  // Awaited and answered on directly (D35): the add closes this dialog, so an
  // effect belonging to it would never run.
  const { submit, pending, error } = useSubmitAction(add, () => {
    toast.success(
      t("drawer.share.added", { name: chosen?.label ?? "", label: projectName }),
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
          <p className="text-sm text-muted-foreground">{t("drawer.share.projectNobody")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sharers.map((person) => (
              <li key={person.id} className="card-face flex items-center gap-3 p-3">
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
                  title={t("drawer.share.removeProjectTitle", { name: person.name })}
                  description={t("drawer.share.removeProjectWarning")}
                  confirmLabel={t("drawer.share.remove")}
                  successMessage={t("drawer.share.removed", {
                    name: person.name,
                    label: projectName,
                  })}
                  onConfirm={() => unshareProjectAction(projectId, person.id)}
                  onDone={() => router.refresh()}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <Label id={`${ids}-who`}>{t("drawer.share.projectWho")}</Label>
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

      <FormFooter
        error={error}
        pending={pending}
        onCancel={onClose}
        confirmLabel={t("drawer.share.add")}
      />
    </form>
  );
}
