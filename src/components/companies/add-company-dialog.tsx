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
import { useLocale, useTranslations } from "next-intl";
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
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { Prose } from "@/components/ui-ext/prose";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDay } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { TONE_CLASS } from "@/lib/state-tone";
import { cn } from "@/lib/utils";
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
 *   owns it, says where it is and when it was last worked, and stays out of the
 *   way; a company is always created (SPEC S15). An ARCHIVED match warns too,
 *   with the day it left and the reason typed then — the case the archive is
 *   kept for (S16, D109).
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
          <Button variant="brand">
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
  const locale = useLocale();
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

  // The country picked on the form, so the phone is read there (D89).
  const countryCode = lookups.countryCodes[company.countryId];

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
      if (typedName.length < 3 && normalizePhone(typedPhone, countryCode) === null) {
        setDuplicate(null);
        return;
      }
      const outcome = await duplicateCheckAction(typedName, typedPhone, countryCode);
      if (cancelled) return;
      setDuplicate(outcome.ok ? (outcome.data ?? null) : null);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [company.name, contact.phone, countryCode]);

  // What the rep decides by, on the form: a live match says where it is and
  // when it was last worked; an archived one says when it left and why (D109).
  // The reason is a block somebody typed, so it takes its own direction.
  const warning =
    duplicate === null ? null : (
      <div
        role="status"
        className={cn("flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs", TONE_CLASS.wait)}
      >
        <Info className="mt-px size-3.5 shrink-0" />
        <span className="flex min-w-0 flex-col gap-0.5">
          {duplicate.archived ? (
            <span>
              {t("forms.duplicateArchived", {
                name: duplicate.name,
                rep: duplicate.rep,
                date: formatDay(duplicate.archived.on, locale),
              })}
            </span>
          ) : (
            <>
              <span>{t("forms.duplicateCompany", { name: duplicate.name, rep: duplicate.rep })}</span>
              <span className="opacity-80">
                {[
                  duplicate.city,
                  duplicate.lastActivityOn
                    ? t("forms.duplicateLastActivity", {
                        date: formatDay(duplicate.lastActivityOn, locale),
                      })
                    : t("forms.duplicateNeverContacted"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </>
          )}
          {duplicate.archived?.reason ? (
            <Prose line text={duplicate.archived.reason} className="opacity-80" />
          ) : null}
          {/* A warning that names a record is a door to it where the reader may
              open it (D121, P11F): his own company's drawer opens over this
              form, the form stays full behind it, and closing the drawer comes
              back here. Another rep's company is not his to read (S8) — the
              warning has already named who has it, and that name is the door.
              `scroll={false}` because the list underneath must not jump while
              both are open. */}
          {duplicate.mine ? (
            <Link
              href={`/companies?open=${duplicate.id}`}
              scroll={false}
              data-slot="open-match"
              className="w-fit underline underline-offset-2 hover:text-foreground"
            >
              {t("forms.openMatch", { name: duplicate.name })}
            </Link>
          ) : null}
        </span>
      </div>
    );

  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={() => {
        submitted.current = company.name.trim();
      }}
      // The browser's own validation is off: it refuses the submit before the
      // action runs and shows its bubble in the BROWSER's language, in its own
      // direction, with wording nobody here wrote. One rejected input, one
      // sentence, from the action that rejected it (DESIGN §5). `required`
      // stays on the inputs — it is what a screen reader announces.
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      <FormBody>
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
            country={countryCode}
          />
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
