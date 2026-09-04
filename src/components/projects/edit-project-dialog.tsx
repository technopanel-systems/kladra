"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateProjectAction } from "@/actions/projects";
import { ProjectFields, type ProjectDraft } from "@/components/projects/project-fields";
import { Button } from "@/components/ui/button";
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

/**
 * Edit project — the same four fields as creating one, opened on what is there.
 *
 * The company is not among them. A project is a job AT a customer (S18); moving
 * one to a different company would take its whole log with it and leave the
 * first customer's history missing a visit that happened.
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
  trigger,
}: {
  project: ProjectEditable;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProjectDraft>(() => draftOf(project));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Re-opening starts from what the project holds now, not from an abandoned
    // edit — the drawer behind may have been refreshed since.
    if (next) {
      setForm(draftOf(project));
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
    if (!name) {
      setErrors({ name: t("common.required") });
      return;
    }

    startTransition(async () => {
      const fields = new FormData();
      fields.set("projectId", project.id);
      fields.set("name", name);
      fields.set("expectedSqm", form.expectedSqm.trim());
      fields.set("nextFollowUp", form.nextFollowUp ?? "");
      fields.set("notes", form.notes.trim());

      const outcome = await updateProjectAction(null, fields);
      if (!outcome.ok) {
        setErrors(outcome.fieldErrors ?? {});
        toast.error(outcome.error);
        return;
      }

      toast.success(t("forms.saved", { name }));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Pencil aria-hidden="true" />
            {t("common.edit")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[88svh] overflow-y-auto overscroll-contain sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.editProject")}</DialogTitle>
        </DialogHeader>

        <ProjectFields
          idPrefix="edit-project"
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
