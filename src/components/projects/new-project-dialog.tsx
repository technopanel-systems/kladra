"use client";

import { useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createProjectAction } from "@/actions/projects";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import {
  BLANK_PROJECT,
  ProjectFields,
  type ProjectDraft,
} from "@/components/projects/project-fields";
import { useFlashProject } from "@/components/projects/project-flash";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
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
 *
 * A refused save names every field it refused and puts the caret on the first
 * (DESIGN §8); a refusal that is about the save and not a field — the server
 * out of reach — is written in the footer, with everything typed still there.
 * A saved one lights its row on the list behind the drawer it opens.
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
  const [refusal, setRefusal] = useState<string | null>(null);
  const [answer, setAnswer] = useState<object | null>(null);
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();
  const flash = useFlashProject();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, answer);

  const asks = companyId === undefined;
  const company = companyId ?? chosen;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setForm(BLANK_PROJECT);
      setChosen("");
      setErrors({});
      setRefusal(null);
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
    setRefusal(null);
    if (Object.keys(refused).length > 0) {
      setErrors(refused);
      setAnswer({});
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

      const outcome = await guarded(createProjectAction)(null, fields);

      if (!outcome.ok) {
        const atFields = outcome.fieldErrors ?? {};
        setErrors(atFields);
        // A sentence with no field to stand under — the company archived since
        // the dialog opened, the wire down — is the footer's.
        setRefusal(Object.values(atFields).some(Boolean) ? null : outcome.error);
        setAnswer({});
        return;
      }

      toast.success(t("projects.created"));
      setOpen(false);
      setForm(BLANK_PROJECT);
      setChosen("");
      setErrors({});
      // The drawer lives in the URL, so the new project opens by navigating,
      // and its row behind the drawer takes the flash.
      if (outcome.data?.projectId) {
        flash(outcome.data.projectId);
        router.push(`/projects?open=${outcome.data.projectId}`);
      } else router.refresh();
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger ?? <Button variant="brand">{t("projects.newProject")}</Button>}
      title={
        companyName ? t("projects.newProjectIn", { company: companyName }) : t("projects.newProject")
      }
      description={t("projects.newProjectHint")}
    >
      {/* A form, so Enter in the name saves it (D114). */}
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) submit();
        }}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <FormBody>
          {asks ? (
            <div className="flex flex-col gap-2">
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
                placeholder={t("common.pickCompany")}
                searchPlaceholder={t("forms.searchList")}
                emptyText={t("projects.noCompanies")}
              />
              <FieldError id="project-company-error">{errors.companyId}</FieldError>
            </div>
          ) : null}

          <ProjectFields
            idPrefix="project"
            value={form}
            onChange={change}
            errors={errors}
            disabled={pending}
          />

        </FormBody>
        <FormFooter error={refusal} pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </ResponsiveDialog>
  );
}
