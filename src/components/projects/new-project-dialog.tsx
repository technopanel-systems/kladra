"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createProjectAction } from "@/actions/projects";
import {
  BLANK_PROJECT,
  ProjectFields,
  type ProjectDraft,
} from "@/components/projects/project-fields";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import type { PickerOption } from "@/lib/picker-option";

/**
 * A project is born inside its company, in a popup (SPEC §3) — name, the
 * expected m² that anchors it (S19), a next follow-up and notes. The fields
 * live in ProjectFields, shared with Edit project.
 *
 * Saving opens the new project's drawer, so the rep lands where the next thing
 * he does — log a visit, set a follow-up — already is.
 *
 * From P8 the company can also be the first FIELD rather than the context. The
 * Projects screen had no button of its own because a project is a job at a
 * customer and the button lived on the customer; Jerom stood on that screen and
 * went hunting. A create dialog that needs a parent asks for the parent
 * (SPEC §3, P8), and the two callers are otherwise the same dialog.
 */

export function NewProjectDialog({
  companyId,
  companyName,
  companies,
  trigger,
}: {
  /** Known when the dialog is opened from inside a company. */
  companyId?: string;
  /** Named in the dialog title when the caller knows it. */
  companyName?: string;
  /** Offered as the first field when the company is NOT known. */
  companies?: PickerOption[];
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProjectDraft>(BLANK_PROJECT);
  const [chosen, setChosen] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const asks = companyId === undefined;
  const company = companyId ?? chosen;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setForm(BLANK_PROJECT);
      setChosen("");
      setErrors({});
    }
  }

  function change(patch: Partial<ProjectDraft>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const touched = Object.keys(patch).filter((key) => prev[key]);
      if (touched.length === 0) return prev;
      const next = { ...prev };
      for (const key of touched) next[key] = "";
      return next;
    });
  }

  function submit() {
    const name = form.name.trim();
    const refused: Record<string, string> = {};
    if (!company) refused.companyId = t("common.required");
    if (!name) refused.name = t("common.required");
    if (Object.keys(refused).length > 0) {
      setErrors(refused);
      return;
    }

    startTransition(async () => {
      // The action takes the `(previous, FormData)` shape every write in
      // src/actions uses, so the same function serves a plain <form action>
      // and this one, which is driven from a transition because the dialog
      // decides where to navigate afterwards. An empty string reads as absent
      // on the other side.
      const fields = new FormData();
      fields.set("companyId", company);
      fields.set("name", name);
      fields.set("expectedSqm", form.expectedSqm.trim());
      fields.set("nextFollowUp", form.nextFollowUp ?? "");
      fields.set("notes", form.notes.trim());

      const outcome = await createProjectAction(null, fields);

      if (!outcome.ok) {
        setErrors(outcome.fieldErrors ?? {});
        toast.error(outcome.error);
        return;
      }

      toast.success(t("projects.created"));
      onOpenChange(false);
      // The drawer lives in the URL, so the new project opens by navigating.
      if (outcome.data?.projectId) router.push(`/projects?open=${outcome.data.projectId}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="brand">
            {t("projects.newProject")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[88svh] overflow-y-auto overscroll-contain sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {companyName
              ? t("projects.newProjectIn", { company: companyName })
              : t("projects.newProject")}
          </DialogTitle>
        </DialogHeader>

        {asks ? (
          <div className="flex flex-col gap-1.5">
            <Label id="project-company-label">{t("common.company")}</Label>
            <SearchableSelect
              aria-labelledby="project-company-label"
              aria-describedby={errors.companyId ? "project-company-error" : undefined}
              invalid={errors.companyId ? true : undefined}
              options={companies ?? []}
              value={chosen}
              onChange={(next) => {
                setChosen(next);
                setErrors((prev) => (prev.companyId ? { ...prev, companyId: "" } : prev));
              }}
              disabled={pending}
              placeholder={t("projects.pickCompany")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("projects.noCompanies")}
            />
            {errors.companyId ? (
              <p id="project-company-error" role="alert" className="text-xs text-destructive">
                {errors.companyId}
              </p>
            ) : null}
          </div>
        ) : null}

        <ProjectFields
          idPrefix="project"
          value={form}
          onChange={change}
          errors={errors}
          disabled={pending}
        />

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button" disabled={pending}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
