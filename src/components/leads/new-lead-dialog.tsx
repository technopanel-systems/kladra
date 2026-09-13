"use client";

import { Plus } from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createLeadAction } from "@/actions/companies";
import { duplicateCheckAction, type DuplicateHit, type FormLookups } from "@/actions/forms";
import { DuplicateWarning } from "@/components/leads/duplicate-warning";
import { useActionOutcome, useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useFormLookups } from "@/components/ui-ext/form-lookups";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { isSaudi, normalizePhone } from "@/lib/phone";
import type { PickerOption } from "@/lib/picker-option";
import type { ActionResult } from "@/lib/types";

/**
 * New lead — marketing's one way in (SPEC §3, P12-7, P13).
 *
 * "A lead is filed with the company, a contact with a phone, where it came from
 * (Marketing is on that list for this role) and the customer's query as the
 * single note — no other note fields — and is assigned to a rep or to herself in
 * the same step."
 *
 * So the form is those five things and what the company row cannot be written
 * without, in the order the call goes: who the customer is and where he is,
 * where he came from, whom to ring there, what he asked for, and who takes him.
 * The query is the ONE box for words. Add company carries a notes box on the
 * company and another on the contact, and a lead with three places to type
 * "wants a price for a four-storey office" is a lead whose question ends up in
 * the wrong one — which is exactly what the founder saw and asked to stop.
 *
 * That is also why these fields are drawn here rather than through the shared
 * `CompanyFields` and `ContactFields`: both end on a notes box, and a lead must
 * not have one. The contact is a name and a number and nothing else, because
 * marketing is typing with the customer on the line and the rep fills in the
 * rest when he rings. The rules the shared fields follow are the same rules
 * here — Saudi Arabia picks its city from the list with Riyadh preselected, any
 * other country types it (SPEC §3); the phone is read in the country just
 * chosen (D89) and shows what will be stored; every field is controlled so a
 * refused save comes back full.
 *
 * Duplicate warnings as Add company has them (D158): the name warns under the
 * name, the number under the number, and neither blocks the save.
 *
 * Nothing here converts anything later. The row is on the chosen floor when
 * Save returns, the phone number is on it, and it is in his band and on his day.
 */

const DEBOUNCE_MS = 400;

export function NewLeadDialog({
  targets,
  trigger,
}: {
  /** Everyone a lead may be given to, the filer first — read once, on the server. */
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
      // The list it lands on is this one. No id in the address: a lead is read
      // as a row here and opened as a customer on the companies screen, by
      // whoever holds him.
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
        <DialogFormSkeleton rows={7} />
      )}
    </ResponsiveDialog>
  );
}

type LeadDraft = {
  name: string;
  categoryId: string;
  leadSourceId: string;
  countryId: string;
  cityId: string;
  cityText: string;
  contactName: string;
  contactPhone: string;
  query: string;
  repId: string;
};

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

  const [draft, setDraft] = useState<LeadDraft>(() => ({
    name: "",
    categoryId: "",
    leadSourceId: "",
    countryId: lookups.saudiCountry ?? "",
    cityId: lookups.defaultCity ?? "",
    cityText: "",
    contactName: "",
    contactPhone: "",
    query: "",
    repId: "",
  }));
  const change = (patch: Partial<LeadDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateHit | null>(null);

  // Named at submit time, so the toast says what was filed and who has it
  // without every keystroke re-running the effect that reads them.
  const filed = useRef({ name: "", rep: "" });
  const form = useRef<HTMLFormElement>(null);

  useFocusFirstError(form, state);
  useActionOutcome(state, () => onCreated(filed.current.name, filed.current.rep));

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const error = (field: string) => errors[field];
  const id = (field: string) => `${ids}-${field}`;

  const inSaudi = lookups.saudiCountry !== null && draft.countryId === lookups.saudiCountry;
  // The country picked on the form, so the phone is read there (D89).
  const countryCode = lookups.countryCodes[draft.countryId];

  const normalized = normalizePhone(draft.contactPhone, countryCode);
  const badPhone = phoneTouched && draft.contactPhone.trim() !== "" && normalized === null;
  // The action's own key, not a second copy of the sentence (DESIGN §5).
  const phoneError =
    error("contactPhone") ??
    (badPhone
      ? t(isSaudi(countryCode) ? "errors.phoneInvalid" : "errors.phoneInvalidAbroad")
      : undefined);

  // "Looks like an existing company" (D8, D158), asked quietly while she types
  // the name or the number and never in the way of the save.
  useEffect(() => {
    const typedName = draft.name.trim();
    const typedPhone = draft.contactPhone.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (typedName.length < 3 && normalizePhone(typedPhone, countryCode) === null) {
        setDuplicate(null);
        return;
      }
      const outcome = await guarded(duplicateCheckAction)(typedName, typedPhone, countryCode);
      if (cancelled) return;
      setDuplicate(outcome.ok ? (outcome.data ?? null) : null);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.name, draft.contactPhone, countryCode, guarded]);

  function pickCountry(next: string) {
    // The picked city goes with the country it belonged to (SPEC §3): leaving it
    // behind would file a company in Dubai under Riyadh.
    if (lookups.saudiCountry !== null && next === lookups.saudiCountry) {
      change({ countryId: next, cityText: "", cityId: lookups.defaultCity ?? "" });
    } else {
      change({ countryId: next, cityId: "" });
    }
  }

  const required = (
    <span aria-hidden="true" className="text-brand">
      *
    </span>
  );

  // A refusal under its field, in the sentence the action wrote (DESIGN §5).
  function fieldError(field: string, errorId: string) {
    const message = error(field);
    return message ? (
      <p id={errorId} role="alert" className="text-xs text-destructive">
        {message}
      </p>
    ) : null;
  }

  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={() => {
        filed.current = {
          name: draft.name.trim(),
          rep: targets.find((person) => person.value === draft.repId)?.label ?? "",
        };
      }}
      // Off for the reason every form here has it off: the browser's own
      // refusal arrives in the browser's language and direction (DESIGN §5).
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      <FormBody>
        {/* ---- the customer ---- */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("name")}>
            {t("common.company")}
            {required}
          </Label>
          <Input
            id={id("name")}
            name="name"
            required
            autoComplete="off"
            value={draft.name}
            onChange={(event) => change({ name: event.target.value })}
            placeholder={t("forms.companyNamePlaceholder")}
            className="h-9"
            aria-invalid={error("name") ? true : undefined}
            aria-describedby={error("name") ? id("name-error") : undefined}
          />
          {fieldError("name", id("name-error"))}
          {duplicate?.matchedOn === "name" ? <DuplicateWarning hit={duplicate} /> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("category")}>{t("common.category")}</Label>
            <SearchableSelect
              id={id("category")}
              value={draft.categoryId}
              onChange={(next) => change({ categoryId: next })}
              options={lookups.categories}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
              invalid={Boolean(error("categoryId"))}
              aria-describedby={error("categoryId") ? id("category-error") : undefined}
            />
            <input type="hidden" name="categoryId" value={draft.categoryId} />
            {fieldError("categoryId", id("category-error"))}
          </div>

          {/* Where it came from — the whole list for this role, Marketing on it
              (SPEC §3, narrowing D1; `seesEveryLeadSource`). */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("lead-source")}>{t("common.leadSource")}</Label>
            <SearchableSelect
              id={id("lead-source")}
              value={draft.leadSourceId}
              onChange={(next) => change({ leadSourceId: next })}
              options={lookups.leadSources}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
              invalid={Boolean(error("leadSourceId"))}
              aria-describedby={error("leadSourceId") ? id("lead-source-error") : undefined}
            />
            <input type="hidden" name="leadSourceId" value={draft.leadSourceId} />
            {fieldError("leadSourceId", id("lead-source-error"))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("country")}>{t("common.country")}</Label>
            <SearchableSelect
              id={id("country")}
              value={draft.countryId}
              onChange={pickCountry}
              options={lookups.countries}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
              invalid={Boolean(error("countryId"))}
            />
            <input type="hidden" name="countryId" value={draft.countryId} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("city")}>{t("common.city")}</Label>
            {inSaudi ? (
              <>
                <SearchableSelect
                  id={id("city")}
                  value={draft.cityId}
                  onChange={(next) => change({ cityId: next })}
                  options={lookups.cities}
                  placeholder={t("forms.choose")}
                  searchPlaceholder={t("forms.searchList")}
                  emptyText={t("forms.noMatch")}
                  invalid={Boolean(error("cityId"))}
                />
                <input type="hidden" name="cityId" value={draft.cityId} />
              </>
            ) : (
              <Input
                id={id("city")}
                name="cityText"
                autoComplete="off"
                value={draft.cityText}
                onChange={(event) => change({ cityText: event.target.value })}
                placeholder={t("forms.cityPlaceholder")}
                className="h-9"
                aria-invalid={error("cityText") ? true : undefined}
              />
            )}
            {error("cityId") || error("cityText") ? (
              <p role="alert" className="text-xs text-destructive">
                {error("cityId") ?? error("cityText")}
              </p>
            ) : null}
          </div>
        </div>

        {/* ---- whom to ring ---- */}
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium">{t("forms.contactHeading")}</h3>
            <p className="text-xs text-muted-foreground">{t("leads.contactHint")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("contact-name")}>
                {t("common.name")}
                {required}
              </Label>
              <Input
                id={id("contact-name")}
                name="contactName"
                autoComplete="off"
                value={draft.contactName}
                onChange={(event) => change({ contactName: event.target.value })}
                className="h-9"
                aria-invalid={error("contactName") ? true : undefined}
                aria-describedby={error("contactName") ? id("contact-name-error") : undefined}
              />
              {fieldError("contactName", id("contact-name-error"))}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("phone")}>
                {t("common.phone")}
                {required}
              </Label>
              <Input
                id={id("phone")}
                name="contactPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                required
                value={draft.contactPhone}
                onChange={(event) => change({ contactPhone: event.target.value })}
                onBlur={() => setPhoneTouched(true)}
                // A phone number is digits and reads left to right in both locales.
                dir="ltr"
                className="h-9 text-start"
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? id("phone-error") : id("phone-help")}
              />
              {phoneError ? (
                <p id={id("phone-error")} role="alert" className="text-xs text-destructive">
                  {phoneError}
                </p>
              ) : normalized ? (
                <p id={id("phone-help")} className="flex items-center gap-1.5 text-xs text-faint">
                  {t("forms.phoneStoredAs")}
                  <span dir="ltr" className="num">
                    {normalized}
                  </span>
                </p>
              ) : (
                <p id={id("phone-help")} className="text-xs text-faint">
                  {t(isSaudi(countryCode) ? "forms.phoneHelp" : "forms.phoneHelpAbroad")}
                </p>
              )}
              {duplicate?.matchedOn === "phone" ? <DuplicateWarning hit={duplicate} /> : null}
            </div>
          </div>
        </div>

        {/* ---- what he asked for, and who takes him ---- */}
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("query")}>
              {t("leads.query")}
              {required}
            </Label>
            <Textarea
              id={id("query")}
              name="query"
              rows={3}
              required
              // The customer's words, typed by whoever took the call, in
              // whichever language he used (rules/words.md).
              dir="auto"
              autoComplete="off"
              value={draft.query}
              onChange={(event) => change({ query: event.target.value })}
              aria-invalid={error("query") ? true : undefined}
              aria-describedby={error("query") ? id("query-error") : id("query-help")}
            />
            {error("query") ? (
              fieldError("query", id("query-error"))
            ) : (
              <p id={id("query-help")} className="text-xs text-faint">
                {t("leads.queryHint")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label id={id("rep")}>
              {t("leads.giveTo")}
              {required}
            </Label>
            <SearchableSelect
              aria-labelledby={id("rep")}
              value={draft.repId}
              onChange={(next) => change({ repId: next })}
              options={targets}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("drawer.handOverSearch")}
              emptyText={t("drawer.handOverNobody")}
              invalid={Boolean(error("repId"))}
              aria-describedby={error("repId") ? id("rep-error") : id("rep-help")}
            />
            <input type="hidden" name="repId" value={draft.repId} />
            {error("repId") ? (
              fieldError("repId", id("rep-error"))
            ) : (
              <p id={id("rep-help")} className="text-xs text-faint">
                {t("leads.giveToHint")}
              </p>
            )}
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
