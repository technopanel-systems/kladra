"use client";

import { Plus } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FormLookups } from "@/actions/forms";
import { createContactAction } from "@/actions/contacts";
import {
  ContactFields,
  EMPTY_CONTACT,
  type ContactDraft,
} from "@/components/contacts/contact-fields";
import { useFormLookups } from "@/components/ui-ext/form-lookups";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/types";

/**
 * Add contact, from the company drawer's Contacts tab.
 *
 * The same five fields as the first contact in Add company, so a rep learns one
 * form: name, the mandatory phone, position, email, notes. The one extra is
 * "make this the main contact" — the first contact is main automatically
 * (SPEC D18), and this is how a rep moves it when the person he actually deals
 * with changes.
 *
 * A phone already on this company is refused by the database (one number per
 * company); the action answers with a sentence on the phone field rather than a
 * constraint name, and the rest of the form is still there to fix.
 */

export function AddContactDialog({
  companyId,
  trigger,
}: {
  companyId: string;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useFormLookups(open);

  const onCreated = useCallback(
    (name: string) => {
      toast.success(t("forms.added", { name }));
      setOpen(false);
      // No navigation: the drawer is already where the new contact belongs, so
      // the screen re-reads itself rather than asking anyone to refresh.
      router.refresh();
    },
    [router, t],
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={t("forms.addContact")}
      description={t("forms.addContactHint")}
      trigger={
        trigger ?? (
          <Button variant="outline">
            <Plus />
            {t("forms.addContact")}
          </Button>
        )
      }
    >
      {failed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : lookups ? (
        <ContactForm
          companyId={companyId}
          lookups={lookups}
          onCreated={onCreated}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <DialogFormSkeleton rows={4} />
      )}
    </ResponsiveDialog>
  );
}

function ContactForm({
  companyId,
  lookups,
  onCreated,
  onCancel,
}: {
  companyId: string;
  lookups: FormLookups;
  onCreated: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ contactId: string }> | null,
    FormData
  >(createContactAction, null);

  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [isMain, setIsMain] = useState(false);
  const submitted = useRef("");

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) onCreated(submitted.current);
  }, [state, onCreated]);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitted.current = contact.name.trim() || contact.phone.trim();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="companyId" value={companyId} />

      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
        <ContactFields
          idPrefix="contact"
          names={{
            name: "name",
            phone: "phone",
            position: "position",
            email: "email",
            notes: "notes",
          }}
          positions={lookups.positions}
          value={contact}
          onChange={(patch) => setContact((current) => ({ ...current, ...patch }))}
          errors={errors}
        />

        <div className="flex items-center gap-2.5">
          <Checkbox
            id="contact-is-main"
            checked={isMain}
            onCheckedChange={(checked) => setIsMain(checked === true)}
          />
          <Label htmlFor="contact-is-main" className="font-normal">
            {t("forms.makeMain")}
          </Label>
          <input type="hidden" name="isMain" value={isMain ? "true" : "false"} />
        </div>
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
