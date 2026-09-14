"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateProjectAction } from "@/actions/projects";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { ProjectFields, type ProjectDraft } from "@/components/projects/project-fields";
import { useFlashProject } from "@/components/projects/project-flash";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { useRouter } from "@/i18n/navigation";

/**
 * Edit project — the same four fields as creating one, opened on what is there.
 *
 * The company is not among them. A project is a job AT a customer (S18); moving
 * one to a different company would take its whole log with it and leave the
 * first customer's history missing a visit that happened.
 *
 * Hosted by the drawer (P13-G6): Edit is an item in the drawer's menu, and an
 * item is gone the moment the menu closes, so it cannot own a trigger. The
 * drawer passes `open` and hands focus back to its menu button (`useOpener`).
 */

export type ProjectEditable = {
  id: string;
  name: string;
  expectedSqm: string | null;
  nextFollowUp: string | null;
  notes: string | null;
};

function draftOf(project: ProjectEditable): ProjectDraft {
  return {
    name: project.name,
    // Stored as numeric(12,2), so it arrives as "1200.00". A rep who opens the
    // dialog to fix the name should not find his 1,200 turned into 1200.00 and
    // have to decide whether that matters.
    expectedSqm: project.expectedSqm === null ? "" : String(Number(project.expectedSqm)),
    nextFollowUp: project.nextFollowUp,
    notes: project.notes ?? "",
  };
}

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectEditable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const flash = useFlashProject();
  const [form, setForm] = useState<ProjectDraft>(() => draftOf(project));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [answer, setAnswer] = useState<object | null>(null);
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();
  const formRef = useRef<HTMLFormElement>(null);
  // A refused save puts the caret on the first field it names (DESIGN §8).
  useFocusFirstError(formRef, answer);

  // Re-opening starts from what the project holds now, not from an abandoned
  // edit — the drawer behind may have been refreshed since.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(draftOf(project));
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
    setRefusal(null);
    if (!name) {
      setErrors({ name: t("common.required") });
      setAnswer({});
      return;
    }

    startTransition(async () => {
      const fields = new FormData();
      fields.set("projectId", project.id);
      fields.set("name", name);
      fields.set("expectedSqm", form.expectedSqm.trim());
      fields.set("nextFollowUp", form.nextFollowUp ?? "");
      fields.set("notes", form.notes.trim());

      const outcome = await guarded(updateProjectAction)(null, fields);
      if (!outcome.ok) {
        // At the field when a field was refused; in the footer when the whole
        // save was — the server out of reach says so where the eye already is,
        // and what he typed stays (DESIGN §8).
        const atFields = outcome.fieldErrors ?? {};
        setErrors(atFields);
        setRefusal(Object.values(atFields).some(Boolean) ? null : outcome.error);
        setAnswer({});
        return;
      }

      toast.success(t("forms.saved", { name }));
      onOpenChange(false);
      flash(project.id);
      router.refresh();
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("projects.editProject")}
      context={project.name}
      description={t("projects.editProjectHint")}
    >
      {/* A form, so Enter in a field saves it (D114). */}
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
          <ProjectFields
            idPrefix="edit-project"
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
