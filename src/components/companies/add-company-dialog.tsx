"use client";

import { Info, Plus } from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createCompanyAction } from "@/actions/companies";
import { duplicateCheckAction, type DuplicateHit, type FormLookups } from "@/actions/forms";
import {
  CompanyFields,
  blankCompany,
  type CompanyDraft,
} from "@/components/companies/company-fields";
import {
  ContactFields,
  EMPTY_CONTACT,
  type ContactDraft,
} from "@/components/contacts/contact-fields";
import { useActionOutcome } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useFormLookups } from "@/components/ui-ext/form-lookups";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";
import { normalizePhone } from "@/lib/phone";
import type { ActionResult } from "@/lib/types";

/**
 * Add company — the rep's most common act after logging (SPEC §3).
 *
 * One popup, in the founder's field order, with the first contact captured in
 * the same popup: a company with nobody to ring is not a lead, and asking for a
 * second screen is how FACET lost the phone numbers.
 *
 * The fields themselves live in CompanyFields and ContactFields, shared with
 * Edit company and Add contact — one definition, so a rep learns the order once.
 *
 * Three things it will not do:
 *
 * - **Block on a duplicate.** The warning names the company and the rep who
 *   owns it and stays out of the way; a company is always created (SPEC S15).
 * - **Ask for a city we do not have.** Saudi Arabia picks from the seeded list
 *   with Riyadh already chosen; anywhere else the city is a box to type in.
 * - **Lose what was typed.** Every field is controlled, so a refused save comes
 *   back with the form still full.
 */

const DEBOUNCE_MS = 400;

export function AddCompanyDialog({ trigger }: { trigger?: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useFormLookups(open);

  const onCreated = useCallback(
    (id: string, name: string) => {
      toast.success(t("forms.added", { name }));
      setOpen(false);
      // The open record lives in the URL, so a refresh or a shared link lands
      // on the same company (SPEC §3). Filters already in the address survive.
      const params = new URLSearchParams(window.location.search);
      params.set("open", id);
      router.push(
        pathname === "/companies" ? `/companies?${params.toString()}` : `/companies?open=${id}`,
      );
    },
    [router, pathname, t],
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={t("forms.addCompany")}
      description={t("forms.addCompanyHint")}
      trigger={
        trigger ?? (
          // The brand gradient lives on the primary button and nowhere else.
          // Never disabled while the lists load: nothing is fetched until this
          // is pressed, and a primary action that greys itself out reads as
          // broken (DESIGN §2).
          <Button className="bg-[image:var(--brand-grad)] text-primary-foreground shadow-[var(--brand-glow)] hover:opacity-90">
            <Plus />
            {t("forms.addCompany")}
          </Button>
        )
      }
    >
      {failed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : lookups ? (
        <CompanyForm lookups={lookups} onCreated={onCreated} onCancel={() => setOpen(false)} />
      ) : (
        <DialogFormSkeleton rows={6} />
      )}
    </ResponsiveDialog>
  );
}

function CompanyForm({
  lookups,
  onCreated,
  onCancel,
}: {
  lookups: FormLookups;
  onCreated: (id: string, name: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ companyId: string }> | null,
    FormData
  >(createCompanyAction, null);

  const [company, setCompany] = useState<CompanyDraft>(() => blankCompany(lookups));
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [duplicate, setDuplicate] = useState<DuplicateHit | null>(null);

  // Named at submit time so the toast can say what was added without the
  // effect having to depend on every keystroke.
  const submitted = useRef("");
  const form = useRef<HTMLFormElement>(null);

  useFocusFirstError(form, state);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useActionOutcome(state, (data) => {
    if (data) onCreated(data.companyId, submitted.current);
  });

  // "Looks like an existing company" (SPEC D8). Asked while the rep types the
  // name or the number, quietly, and never in the way of the save.
  useEffect(() => {
    const typedName = company.name.trim();
    const typedPhone = contact.phone.trim();
    let cancelled = false;
    // Too little to go on is decided inside the debounce rather than in the
    // effect body. Clearing synchronously costs a render on every keystroke,
    // and it made the warning blink away and back while a rep kept typing.
    const timer = setTimeout(async () => {
      if (typedName.length < 3 && normalizePhone(typedPhone) === null) {
        setDuplicate(null);
        return;
      }
      const outcome = await duplicateCheckAction(typedName, typedPhone);
      if (cancelled) return;
      setDuplicate(outcome.ok ? (outcome.data ?? null) : null);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [company.name, contact.phone]);

  const warning =
    duplicate === null ? null : (
      <p
        role="status"
        className="flex items-start gap-1.5 rounded-lg bg-tone-amber px-2.5 py-1.5 text-xs text-tone-amber-fg"
      >
        <Info className="mt-px size-3.5 shrink-0" />
        <span>{t("forms.duplicateCompany", { name: duplicate.name, rep: duplicate.rep })}</span>
      </p>
    );

  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={() => {
        submitted.current = company.name.trim();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* min-h-0 and flex-1: without them this scroller sizes to its
          content instead of to the space left over, so it ran under the
          footer below and the footer covered the last field. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
        <CompanyFields
          idPrefix="company"
          lookups={lookups}
          value={company}
          onChange={(patch) => setCompany((current) => ({ ...current, ...patch }))}
          errors={errors}
          belowName={duplicate?.matchedOn === "name" ? warning : null}
        />

        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium">{t("forms.contactHeading")}</h3>
            <p className="text-xs text-muted-foreground">{t("forms.contactHeadingHint")}</p>
          </div>
          <ContactFields
            idPrefix="company-contact"
            names={{
              name: "contactName",
              phone: "contactPhone",
              position: "contactPosition",
              email: "contactEmail",
              notes: "contactNotes",
            }}
            positions={lookups.positions}
            value={contact}
            onChange={(patch) => setContact((current) => ({ ...current, ...patch }))}
            errors={errors}
            belowPhone={duplicate?.matchedOn === "phone" ? warning : null}
          />
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
