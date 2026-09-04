"use client";

import { Plus } from "lucide-react";
import { useActionState, useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FormLookups } from "@/actions/forms";
import { createContactAction } from "@/actions/contacts";
import {
  ContactFields,
  EMPTY_CONTACT,
  type ContactDraft,
} from "@/components/contacts/contact-fields";
import { useActionOutcome } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useFormLookups } from "@/components/ui-ext/form-lookups";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
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
  const form = useRef<HTMLFormElement>(null);

  useFocusFirstError(form, state);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useActionOutcome(state, () => onCreated(submitted.current));

  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={() => {
        submitted.current = contact.name.trim() || contact.phone.trim();
      }}
      // The browser's own validation is off: it refuses the submit before the
      // action runs and shows its bubble in the BROWSER's language, in its own
      // direction, with wording nobody here wrote. One rejected input, one
      // sentence, from the action that rejected it (DESIGN §5). `required`
      // stays on the inputs — it is what a screen reader announces.
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="companyId" value={companyId} />

      <FormBody>
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
      </FormBody>

      <FormFooter
        error={state && !state.ok && !state.fieldErrors ? state.error : null}
        pending={pending}
        onCancel={onCancel}
      />
    </form>
  );
}
