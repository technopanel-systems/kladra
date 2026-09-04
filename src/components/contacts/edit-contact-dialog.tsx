"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FormLookups } from "@/actions/forms";
import { updateContactAction } from "@/actions/contacts";
import {
  ContactFields,
  type ContactDraft,
} from "@/components/contacts/contact-fields";
import { useActionOutcome } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useFormLookups } from "@/components/ui-ext/form-lookups";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/types";

/**
 * Edit contact — the same five fields as adding one, opened on what is there.
 *
 * The company is not among them. A contact belongs to ONE company; a person who
 * moves is a new contact at the new company, and the old row stays so that a
 * visit logged two years ago still says who the rep met (SPEC S11).
 */

export type ContactEditable = {
  id: string;
  name: string;
  phone: string;
  position: string | null;
  email: string | null;
  notes: string | null;
};

function draftOf(contact: ContactEditable): ContactDraft {
  return {
    name: contact.name,
    phone: contact.phone,
    position: contact.position ?? "",
    email: contact.email ?? "",
    notes: contact.notes ?? "",
  };
}

export function EditContactDialog({
  contact,
  trigger,
}: {
  contact: ContactEditable;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useFormLookups(open);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={t("forms.editContact")}
      description={t("forms.editContactHint")}
      trigger={trigger ?? <Button variant="outline">{t("common.edit")}</Button>}
    >
      {failed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : lookups ? (
        <EditForm
          key={contact.id}
          contact={contact}
          lookups={lookups}
          onSaved={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <DialogFormSkeleton rows={4} />
      )}
    </ResponsiveDialog>
  );
}

function EditForm({
  contact,
  lookups,
  onSaved,
  onCancel,
}: {
  contact: ContactEditable;
  lookups: FormLookups;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ contactId: string }> | null,
    FormData
  >(updateContactAction, null);

  const [draft, setDraft] = useState<ContactDraft>(() => draftOf(contact));
  const form = useRef<HTMLFormElement>(null);
  const saved = useRef("");

  useFocusFirstError(form, state);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useActionOutcome(state, () => {
    toast.success(t("forms.saved", { name: saved.current }));
    onSaved();
    // The drawer, the row and the follow-up strip are all server rendered from
    // the same query; one refresh brings them back together.
    router.refresh();
  });

  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={() => {
        saved.current = draft.name.trim() || draft.phone.trim();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="contactId" value={contact.id} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
        <ContactFields
          idPrefix="edit-contact"
          names={{
            name: "name",
            phone: "phone",
            position: "position",
            email: "email",
            notes: "notes",
          }}
          positions={lookups.positions}
          value={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          errors={errors}
          disabled={pending}
        />
      </div>

      <div className="border-t border-line bg-surface-2 p-4">
        {state && !state.ok && !state.fieldErrors ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className="bg-[image:var(--brand-grad)] text-primary-foreground shadow-[var(--brand-glow)] hover:opacity-90"
          >
            {pending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
