"use client";

import { Plus } from "lucide-react";
import { useActionState, useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createLeadAction } from "@/actions/companies";
import type { FormLookups } from "@/actions/forms";
import { CompanyFields, blankCompany, type CompanyDraft } from "@/components/companies/company-fields";
import { ContactFields, EMPTY_CONTACT, type ContactDraft } from "@/components/contacts/contact-fields";
import { useActionOutcome, useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useFormLookups } from "@/components/ui-ext/form-lookups";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { PickerOption } from "@/lib/picker-option";
import type { ActionResult } from "@/lib/types";

/**
 * New lead — marketing's one way in (SPEC §3, P12-7).
 *
 * "Marketing does not use the Add company form. Marketing has its own module
 * for bringing in a lead, and creating one there IS an assignment."
 *
 * So this is Add company plus the two things that make a lead a lead, and the
 * two are what the form ends on, above Save: what the customer asked for, and
 * whose floor he lands on. In that order, because it is the order the decision
 * is made in — you cannot choose the rep until you know what the job is.
 *
 * The customer's own fields are `CompanyFields` and `ContactFields`, the same
 * two components Add company and Edit company use. Not a copy: a lead IS a
 * company, and a second form for the same seven fields would be the one that
 * drifts the first time a field moves.
 *
 * Nothing here converts anything later. The row is on the rep's floor when Save
 * returns, his phone number is on it, and his day says so in the morning.
 */
export function NewLeadDialog({
  targets,
  trigger,
}: {
  /** Everyone a lead may be given to — read once, on the server (P12-7). */
  targets: PickerOption[];
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useFormLookups(open);

  const onCreated = useCallback(
    (name: string, to: string) => {
      toast.success(t("leads.filed", { name, rep: to }));
      setOpen(false);
      // The list it lands on is this one, and it lands at the top of it — the
      // unacknowledged half, oldest last. No id in the address: a lead is read
      // as a row here and opened as a customer on the companies screen, and
      // marketing has no business in that drawer's write buttons.
      router.refresh();
    },
    [router, t],
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={t("leads.new")}
      description={t("leads.newHint")}
      trigger={
        trigger ?? (
          <Button variant="brand">
            <Plus />
            {t("leads.new")}
          </Button>
        )
      }
    >
      {failed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : lookups ? (
        <LeadForm
          lookups={lookups}
          targets={targets}
          onCreated={onCreated}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <DialogFormSkeleton rows={6} />
      )}
    </ResponsiveDialog>
  );
}

function LeadForm({
  lookups,
  targets,
  onCreated,
  onCancel,
}: {
  lookups: FormLookups;
  targets: PickerOption[];
  onCreated: (name: string, to: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const ids = useId();
  const guarded = useWireGuard();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ companyId: string }> | null,
    FormData
  >(guarded(createLeadAction), null);

  const [company, setCompany] = useState<CompanyDraft>(() => blankCompany(lookups));
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [query, setQuery] = useState("");
  const [repId, setRepId] = useState<string>("");

  // Named at submit time, so the toast says what was filed and who has it
  // without every keystroke re-running the effect that reads them.
  const filed = useRef({ name: "", rep: "" });
  const form = useRef<HTMLFormElement>(null);

  useFocusFirstError(form, state);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const error = (field: string) => errors[field];
  const countryCode = lookups.countryCodes[company.countryId];

  useActionOutcome(state, () => onCreated(filed.current.name, filed.current.rep));

  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={() => {
        filed.current = {
          name: company.name.trim(),
          rep: targets.find((person) => person.value === repId)?.label ?? "",
        };
      }}
      // Off for the reason every form here has it off: the browser's own
      // refusal arrives in the browser's language and direction (DESIGN §5).
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      <FormBody>
        <CompanyFields
          idPrefix="lead"
          lookups={lookups}
          value={company}
          onChange={(patch) => setCompany((current) => ({ ...current, ...patch }))}
          errors={errors}
        />

        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium">{t("forms.contactHeading")}</h3>
            <p className="text-xs text-muted-foreground">{t("forms.contactHeadingHint")}</p>
          </div>
          <ContactFields
            idPrefix="lead-contact"
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
            country={countryCode}
          />
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium">{t("leads.handOverHeading")}</h3>
            <p className="text-xs text-muted-foreground">{t("leads.handOverHint")}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-query`}>
              {t("leads.query")}
              <span aria-hidden="true" className="text-brand">
                *
              </span>
            </Label>
            <Textarea
              id={`${ids}-query`}
              name="query"
              rows={3}
              required
              // The customer's words, typed by whoever took the call, in
              // whichever language he used (rules/words.md).
              dir="auto"
              // As every free-text field in this app is: nothing here is worth
              // a browser's saved-values list, and a password manager offering
              // to fill a customer's question is noise on a form somebody is
              // typing with a customer on the line.
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("leads.queryPlaceholder")}
              aria-invalid={error("query") ? true : undefined}
              aria-describedby={error("query") ? `${ids}-query-error` : undefined}
            />
            {error("query") ? (
              <p id={`${ids}-query-error`} role="alert" className="text-xs text-destructive">
                {error("query")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label id={`${ids}-rep`}>
              {t("leads.giveTo")}
              <span aria-hidden="true" className="text-brand">
                *
              </span>
            </Label>
            <SearchableSelect
              aria-labelledby={`${ids}-rep`}
              value={repId}
              onChange={setRepId}
              options={targets}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("drawer.handOverSearch")}
              emptyText={t("drawer.handOverNobody")}
              invalid={Boolean(error("repId"))}
              aria-describedby={error("repId") ? `${ids}-rep-error` : undefined}
            />
            <input type="hidden" name="repId" value={repId} />
            {error("repId") ? (
              <p id={`${ids}-rep-error`} role="alert" className="text-xs text-destructive">
                {error("repId")}
              </p>
            ) : null}
          </div>
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
