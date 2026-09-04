"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createProjectAction } from "@/actions/projects";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { useRouter } from "@/i18n/navigation";

/**
 * A project is born inside its company, in a popup (SPEC §3) — name, the
 * expected m² that anchors it (S19), a next follow-up and notes. There is NO
 * state field here: a project starts simply open, and "Mark lost (reason)" is
 * a later action (SPEC §3, D11).
 *
 * Saving opens the new project's drawer, so the rep lands where the next thing
 * he does — log a visit, set a follow-up — already is.
 */

type Form = {
  name: string;
  expectedSqm: string;
  nextFollowUp: string | null;
  notes: string;
};

const BLANK: Form = { name: "", expectedSqm: "", nextFollowUp: null, notes: "" };

export function NewProjectDialog({
  companyId,
  companyName,
  trigger,
}: {
  companyId: string;
  /** Named in the dialog title when the caller knows it. */
  companyName?: string;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setForm(BLANK);
      setErrors({});
    }
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  }

  function submit() {
    const name = form.name.trim();
    if (!name) {
      setErrors({ name: t("common.required") });
      return;
    }

    startTransition(async () => {
      // The action takes the `(previous, FormData)` shape every write in
      // src/actions uses, so the same function serves a plain <form action>
      // and this one, which is driven from a transition because the dialog
      // decides where to navigate afterwards. An empty string reads as absent
      // on the other side.
      const fields = new FormData();
      fields.set("companyId", companyId);
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
          <Button className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
            {t("projects.newProject")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {companyName
              ? t("projects.newProjectIn", { company: companyName })
              : t("projects.newProject")}
          </DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor="project-name">{t("common.name")}</FieldLabel>
            <Input
              id="project-name"
              value={form.name}
              autoComplete="off"
              aria-invalid={!!errors.name}
              placeholder={t("projects.namePlaceholder")}
              onChange={(event) => set("name", event.target.value)}
            />
            <FieldError>{errors.name}</FieldError>
          </Field>

          <Field data-invalid={errors.expectedSqm ? true : undefined}>
            <FieldLabel htmlFor="project-sqm">{t("common.expectedSqm")}</FieldLabel>
            <Input
              id="project-sqm"
              className="num"
              inputMode="decimal"
              dir="ltr"
              value={form.expectedSqm}
              autoComplete="off"
              aria-invalid={!!errors.expectedSqm}
              onChange={(event) => set("expectedSqm", event.target.value)}
            />
            <FieldDescription>{t("projects.expectedSqmHint")}</FieldDescription>
            <FieldError>{errors.expectedSqm}</FieldError>
          </Field>

          <Field data-invalid={errors.nextFollowUp ? true : undefined}>
            <FieldLabel htmlFor="project-follow-up">{t("common.nextFollowUp")}</FieldLabel>
            <DatePicker
              id="project-follow-up"
              value={form.nextFollowUp}
              onChange={(day: string | null) => set("nextFollowUp", day)}
            />
            <FieldError>{errors.nextFollowUp}</FieldError>
          </Field>

          <Field data-invalid={errors.notes ? true : undefined}>
            <FieldLabel htmlFor="project-notes">{t("common.notes")}</FieldLabel>
            <Textarea
              id="project-notes"
              rows={3}
              value={form.notes}
              placeholder={t("projects.notesPlaceholder")}
              onChange={(event) => set("notes", event.target.value)}
            />
            <FieldError>{errors.notes}</FieldError>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
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
