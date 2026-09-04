"use client";

import { Pencil } from "lucide-react";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateCompanyAction } from "@/actions/companies";
import type { FormLookups } from "@/actions/forms";
import { CompanyFields, type CompanyDraft } from "@/components/companies/company-fields";
import { useActionOutcome } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useFormLookups } from "@/components/ui-ext/form-lookups";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/types";

/**
 * Edit company — the same fields as Add company, minus the contact, which has
 * its own dialog. It opens on what the company already holds, so a rep fixing a
 * misspelt name does not have to re-choose the category he set last year.
 *
 * The contact is deliberately absent. A company's first contact is captured
 * with the company because a lead with nobody to ring is not a lead; after
 * that, contacts are their own list with their own add and edit, and putting
 * one of them back in this dialog would ask "which one?".
 */

/** What the drawer already knows about the company, as form values. */
export type CompanyEditable = {
  id: string;
  name: string;
  categoryId: number;
  leadSourceId: number;
  countryId: number;
  cityId: number | null;
  cityText: string | null;
  notes: string | null;
};

function draftOf(company: CompanyEditable): CompanyDraft {
  return {
    name: company.name,
    categoryId: String(company.categoryId),
    leadSourceId: String(company.leadSourceId),
    countryId: String(company.countryId),
    cityId: company.cityId === null ? "" : String(company.cityId),
    cityText: company.cityText ?? "",
    notes: company.notes ?? "",
  };
}

export function EditCompanyDialog({
  company,
  trigger,
}: {
  company: CompanyEditable;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useFormLookups(open);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={t("forms.editCompany")}
      description={t("forms.editCompanyHint")}
      trigger={
        trigger ?? (
          <Button variant="ghost">
            <Pencil aria-hidden="true" />
            {t("common.edit")}
          </Button>
        )
      }
    >
      {failed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : lookups ? (
        <EditForm
          // Keyed by the company, so opening a different one starts from its
          // own values rather than the last one's.
          key={company.id}
          company={company}
          lookups={lookups}
          onSaved={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <DialogFormSkeleton rows={5} />
      )}
    </ResponsiveDialog>
  );
}

function EditForm({
  company,
  lookups,
  onSaved,
  onCancel,
}: {
  company: CompanyEditable;
  lookups: FormLookups;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ companyId: string }> | null,
    FormData
  >(updateCompanyAction, null);

  const [draft, setDraft] = useState<CompanyDraft>(() => draftOf(company));
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
        saved.current = draft.name.trim();
      }}
      // The browser's own validation is off: it refuses the submit before the
      // action runs and shows its bubble in the BROWSER's language, in its own
      // direction, with wording nobody here wrote. One rejected input, one
      // sentence, from the action that rejected it (DESIGN §5). `required`
      // stays on the inputs — it is what a screen reader announces.
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="companyId" value={company.id} />

      <FormBody>
        <CompanyFields
          idPrefix="edit-company"
          lookups={lookups}
          value={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          errors={errors}
          disabled={pending}
        />
      </FormBody>

      <FormFooter
        error={state && !state.ok && !state.fieldErrors ? state.error : null}
        pending={pending}
        onCancel={onCancel}
      />
    </form>
  );
}
