"use client";

import { FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  contactChoicesAction,
  creditChoicesAction,
  type ContactChoices,
  type CreditChoices,
  type QuotationLookups,
} from "@/actions/forms";
import {
  quotationOnBehalfAction,
  quotationServiceChoicesAction,
  requestQuotationAction,
  reviseQuotationAction,
  updateQuotationAction,
} from "@/actions/quotations";
import {
  QuotationLines,
  blankLine,
  linesPayload,
  type LineDraft,
} from "@/components/quotations/quotation-lines";
import {
  QuotationServices,
  servicesPayload,
  type ServiceDraft,
} from "@/components/quotations/quotation-services";
import { useFlashQuotation } from "@/components/quotations/quotation-flash";
import { PaperSummary, QuotationTotals } from "@/components/quotations/quotation-totals";
import type { SelectOption } from "@/components/ui-ext/searchable-select";
import { useSubmitAction, useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { useQuotationLookups } from "@/components/ui-ext/form-lookups";
import { CreditField } from "@/components/ui-ext/credit-field";
import { FormBody, FormFooter, FormSection, FormSplit } from "@/components/ui-ext/form-shell";
import { RaisedForField, useOnBehalf } from "@/components/ui-ext/raised-for-field";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { lineRefusal } from "@/lib/line-refusal";
import { quotationTotals } from "@/lib/money";
import {
  openingFor,
  quotationEligible,
  type QuotationOnBehalf,
} from "@/lib/on-behalf-option";
import { splitOption, type QuotationTargets } from "@/lib/picker-option";

/**
 * Request a quotation, from inside a company or a project (SPEC §3, S28).
 *
 * The same dialog does the asking and the asking again: a request the
 * coordinator sent back is edited here and resubmitted, on the lines that were
 * already typed, because retyping nine fields to change one price is how a rep
 * decides to send it on WhatsApp instead (S54).
 *
 * The totals sit under the lines and move as they are typed. They are the only
 * figures on the screen a rep has to trust, and seeing them add up while he
 * works is what makes him stop checking them on his phone (S31).
 *
 * From P8 the project can be the first FIELD instead of the context, so the
 * Quotations screen has a primary action of its own (SPEC §3, P8). One option
 * carries both ids, because a quotation belongs to a company whether or not it
 * names a project, and asking twice would be asking the same question twice.
 */

export type QuotationDraft = {
  /** What it says it counts for: one person's id, or `split` (D148). */
  creditTo?: string;
  quotationId: string;
  notes: string;
  /** Which store it was priced out of, and who at the customer it is for (P12-9). */
  warehouseId: string;
  contactId: string;
  lines: Omit<LineDraft, "key">[];
  /** Its services, which Edit and Revise open on the way they open on its lines (SPEC §3, P13). */
  services: Omit<ServiceDraft, "key">[];
};

/**
 * Three things that are the same form.
 *
 * `request` is the first ask. `edit` is the same quotation again, after the
 * coordinator sent it back or before she has touched it. `revise` is a NEW
 * quotation carrying the same number, because the old one already exists in
 * SMAC and paper that has gone out is not edited (S34).
 */
export type RequestMode = "request" | "edit" | "revise";

/**
 * The contact field's "nobody" answer, as a value rather than as emptiness
 * (P12-9). `log-dialog.tsx` spells it the same way and for the same reason.
 */
const NOBODY = "none";

/** What a "For" answer with nothing to raise on offers: no customer and no job. */
const NO_TARGETS: QuotationTargets = { companies: [], projects: [] };

const ACTIONS = {
  request: requestQuotationAction,
  edit: updateQuotationAction,
  revise: reviseQuotationAction,
} as const;

export function RequestQuotationDialog({
  companyId,
  projectId,
  projectName,
  targets,
  mode = "request",
  existing,
  issuesDirectly = false,
  trigger,
}: {
  /** Known when the dialog is opened from inside a company or a project. */
  companyId?: string;
  projectId?: string | null;
  /** Named in the title when the request is being raised on a project. */
  projectName?: string | null;
  /**
   * The customers and the jobs to choose between, when neither is known
   * (P12-9). Offered as the first two fields, in that order: a rep knows who he
   * has just spoken to before he knows which of that customer's jobs this is.
   */
  targets?: QuotationTargets;
  mode?: RequestMode;
  /** The lines to open on — required for `edit` and `revise`. */
  existing?: QuotationDraft;
  /**
   * The coordinator, who is the desk this form otherwise writes to (SPEC §3).
   * She types the SMAC number in here and the quotation is issued as she raises
   * it: the same form, one field longer and a different verb on the button.
   *
   * Passed down from the server rather than read from the lookups this dialog
   * fetches on open, because the trigger and the title are drawn before that
   * answer could arrive and a heading that changes from Request to Issue a
   * moment after it is read is worse than either word. `requestQuotationAction`
   * asks the same question of the role again, and it is the one that decides.
   */
  issuesDirectly?: boolean;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useQuotationLookups(open);
  const serviceChoices = useServiceChoices(open);
  // Whom it is for, asked of her alone and only on a first ask: an edit and a
  // revision belong to the paper's own rep already (SPEC §3 P13).
  const onBehalf = useOnBehalf(
    open && issuesDirectly && mode === "request",
    "quotation",
    quotationOnBehalfAction,
  );

  // The row it lands on flashes, where a quotations list is behind the drawer
  // it opens (QuotationFlash); from a company's or a job's drawer there is none.
  const flash = useFlashQuotation();
  const onSaved = useCallback(
    (quotationId: string | undefined) => {
      toast.success(
        t(
          mode === "revise"
            ? issuesDirectly
              ? "quotations.revisedOwn"
              : "quotations.revised"
            : issuesDirectly
              ? "quotations.issuedOwn"
              : "quotations.requested",
        ),
      );
      setOpen(false);
      if (quotationId) {
        flash(quotationId);
        router.push(`/quotations?open=${quotationId}`);
      } else router.refresh();
    },
    [mode, issuesDirectly, router, t, flash],
  );

  const title =
    mode === "edit"
      ? t("quotations.editRequest")
      : mode === "revise"
        ? t("quotations.revise")
        : issuesDirectly
          ? projectName
            ? t("quotations.issueOwnFor", { project: projectName })
            : t("quotations.issueOwn")
          : projectName
            ? t("quotations.requestFor", { project: projectName })
            : t("quotations.request");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={t(issuesDirectly ? "quotations.issueOwnHint" : "quotations.requestHint")}
      // The lines are a table and the services a second one under them: this is
      // the one form in the app that needs the room (SPEC §3, P13).
      size="wide"
      trigger={
        trigger ?? (
          <Button variant="outline">
            <FileText aria-hidden="true" />
            {t(issuesDirectly ? "quotations.issueOwn" : "quotations.request")}
          </Button>
        )
      }
    >
      {failed || serviceChoices === "failed" || onBehalf === "failed" ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : lookups && serviceChoices && onBehalf !== undefined ? (
        <RequestForm
          companyId={companyId ?? null}
          projectId={projectId ?? null}
          targets={targets}
          onBehalf={onBehalf}
          mode={mode}
          existing={existing}
          issuesDirectly={issuesDirectly}
          lookups={lookups}
          serviceChoices={serviceChoices}
          onSaved={onSaved}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <DialogFormSkeleton rows={6} />
      )}
    </ResponsiveDialog>
  );
}

/**
 * The services the form may offer, asked for each time the dialog opens
 * (`quotationServiceChoicesAction`). Null until the first answer; the last good
 * answer is kept across a close, so a second open draws at once and quietly
 * takes whatever the admin has changed since.
 *
 * Not a courtesy read: the services section is part of the form, so a list that
 * could not be fetched is the same "the lists did not load" as the line lists,
 * rather than a section that silently offers nothing (rules/data.md).
 */
function useServiceChoices(open: boolean): SelectOption[] | "failed" | null {
  const guarded = useWireGuard();
  const [choices, setChoices] = useState<SelectOption[] | "failed" | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    guarded(quotationServiceChoicesAction)().then((outcome) => {
      if (cancelled) return;
      const fresh = outcome.ok ? outcome.data : undefined;
      // A failed refresh keeps the list it already had: the form may be open
      // on it, half typed, and "the lists did not load" would take it away.
      setChoices((had) => fresh ?? (Array.isArray(had) ? had : "failed"));
    });
    return () => {
      cancelled = true;
    };
  }, [open, guarded]);
  return choices;
}

function RequestForm({
  companyId,
  projectId,
  targets,
  onBehalf,
  mode,
  existing,
  issuesDirectly,
  lookups,
  serviceChoices,
  onSaved,
  onCancel,
}: {
  companyId: string | null;
  projectId: string | null;
  targets?: QuotationTargets;
  /** The "For" field's answers; null where it is not asked. */
  onBehalf: QuotationOnBehalf | null;
  mode: RequestMode;
  existing?: QuotationDraft;
  issuesDirectly: boolean;
  lookups: QuotationLookups;
  serviceChoices: SelectOption[];
  onSaved: (quotationId: string | undefined) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  // Not useActionState: raising a revision removes the button this dialog hangs
  // off, so the answer has to survive the form's own unmount (useSubmitAction).
  // `answer` is taken in this file by the copy-the-last-quotation offer below,
  // so the refusal keeps its own name here.
  const { submit, pending, error, fieldErrors, answer: refusal } = useSubmitAction(
    ACTIONS[mode],
    (data) => onSaved(data?.quotationId),
  );
  const guarded = useWireGuard();

  /*
   * Company → project → contact, which is the order a rep has the answers in
   * (P12-9). He knows who he has just been speaking to; he then knows which of
   * that customer's jobs this price is for. It asked for the job first, out of
   * one flat list of every job in the building with the customer as a quieter
   * line under it — which is the middle of the chain, and on a real floor is
   * hundreds of rows deep in the one thing he already knew.
   *
   * Choosing a customer clears the job, because a job belongs to a customer and
   * a stale one would be a quotation filed against the wrong record. It is done
   * in the SETTER rather than in an effect: clearing state as a consequence of
   * other state is the cascading render the lint refuses, and the value is
   * already in hand at the moment of the choice.
   */
  const [pickedCompany, setPickedCompany] = useState("");
  const [chosen, setChosen] = useState("");
  const picked = splitOption(chosen);
  const company = companyId ?? pickedCompany;
  const project = projectId ?? picked?.id ?? null;

  /*
   * Whom it is for (SPEC §3 P13), above everything else because everything
   * else follows from it: the customers and the jobs offered are the ones THAT
   * person may raise on, read by the same reader his own screen draws with. It
   * opens on Internal Sales wherever her own paper is an answer at this door,
   * and choosing somebody clears the customer and the job, which may not be
   * his — in the setter, for the reason the customer clears the job below.
   */
  const eligible = useMemo(
    () => (onBehalf ? quotationEligible(onBehalf, { companyId, projectId }) : []),
    [onBehalf, companyId, projectId],
  );
  const [forPick, setForPick] = useState<string | null>(null);
  const raisedFor = onBehalf ? (forPick ?? openingFor(eligible)) : "";
  const offered = onBehalf ? (onBehalf.targets[raisedFor] ?? NO_TARGETS) : targets;

  // The jobs of the customer in hand. Filtered here rather than fetched again:
  // the whole list came down with the screen, and a rep with a customer on the
  // phone should not wait for a round trip between two fields.
  const jobs = useMemo(
    () =>
      (offered?.projects ?? []).filter(
        (option) => splitOption(option.value)?.companyId === company,
      ),
    [offered, company],
  );

  const [lines, setLines] = useState<LineDraft[]>(() =>
    existing
      ? existing.lines.map((line, index) => ({ ...line, key: `existing-${index}` }))
      : [blankLine(lookups)],
  );
  // None on a first ask — nothing is offered from a previous quotation (D163) —
  // and on Edit and Revise the ones this paper already carries, as its lines.
  const [services, setServices] = useState<ServiceDraft[]>(() =>
    (existing?.services ?? []).map((service, index) => ({
      ...service,
      key: `existing-service-${index}`,
    })),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const form = useRef<HTMLFormElement>(null);
  /*
   * This form is taller than the screen — nine fields on one line, the totals,
   * the credit question, and for the coordinator the SMAC number too — so a
   * sentence beside a field is a sentence she may never scroll to. Measured at
   * 1366: the SMAC box sits on the scroller's clipped edge, and the Notes field
   * below it is off the fold entirely. The caret goes to the refused field, the
   * browser scrolls it into view, and a screen reader reads its label with it.
   */
  useFocusFirstError(form, refusal);

  /*
   * Who this one counts for (D148), asked only where the job has more than one
   * rep on it. The list follows the project the way the copy offer above
   * follows the company: on the Quotations screen the job is not known until he
   * picks it, and a question about a job nobody has named yet has no answers.
   *
   * Both the answers and his choice carry the project they belong to, and the
   * two are compared rather than reset. Clearing them when the project changes
   * would be a setState inside an effect, which is the cascading render the
   * lint refuses and, worse, would leave the field naming a person who is not
   * on the job he has just picked.
   */
  // The job and the person it is raised for, together: the pool is HIS on a
  // paper she raises for him, and his name is the answer it opens on (P13).
  const creditKey = project ? `${project}|${raisedFor}` : null;
  const [credit, setCredit] = useState<{ key: string; choices: CreditChoices } | null>(null);
  const [creditPick, setCreditPick] = useState<{ key: string; value: string } | null>(
    // An EDIT opens on what it already says; a REVISION does not. A revision is
    // a new quotation, and §3's rule is that nothing is ever carried forward
    // from a previous record — credit least of all, since carrying it is
    // exactly the inheriting D148 forbids.
    creditKey && mode === "edit" && existing?.creditTo
      ? { key: creditKey, value: existing.creditTo }
      : null,
  );
  useEffect(() => {
    if (!project) return;
    const key = `${project}|${raisedFor}`;
    let cancelled = false;
    // A failure here is not an error the rep should see: the question is simply
    // not asked, and the metres go to the man raising it, as they did before.
    guarded(creditChoicesAction)({
      projectId: project,
      repId: raisedFor || undefined,
    }).then((outcome) => {
      if (!cancelled && outcome.ok && outcome.data) {
        setCredit({ key, choices: outcome.data });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project, raisedFor, guarded]);

  const choices = credit && credit.key === creditKey ? credit.choices : null;
  const countsFor = (creditPick && creditPick.key === creditKey ? creditPick.value : "") || choices?.mine || "";

  /*
   * Who at the customer the paper goes to (P12-9) — the last link of the chain,
   * and the only one that needs a round trip: the customers and the jobs came
   * down with the screen, and the people belong to whichever customer he has
   * just picked.
   *
   * Kept exactly the way the credit question above is: the answers carry the
   * company they are about and his choice carries it too, so a customer changed
   * mid-form takes both with it rather than leaving a name from the last one on
   * the field. Clearing them in an effect would be the cascading render the
   * lint refuses, and would leave a moment where the field names somebody at
   * another company.
   */
  const [people, setPeople] = useState<{ companyId: string; choices: ContactChoices } | null>(null);
  const [contactPick, setContactPick] = useState<{ companyId: string; value: string } | null>(
    /*
     * An edit and a revision both open on the paper they came from — the same
     * way they open on its lines (D10). What §3 forbids is a value carried from
     * one record into the NEXT one like it, which is a different thing.
     *
     * `NOBODY` and not null when the paper names nobody: null means "he has not
     * answered", which falls through to the only-contact-there-is below, so a
     * quotation deliberately addressed to the company would have acquired a
     * name the moment somebody opened it to change a price.
     */
    company && existing ? { companyId: company, value: existing.contactId || NOBODY } : null,
  );
  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    // A failure here is not an error the rep should see: the field simply
    // offers nobody, and a quotation addressed to nobody is a real quotation.
    // Read as the person it is for when she raises it for somebody: his
    // customer's people, which her own reading of the floor does not reach.
    guarded(contactChoicesAction)({ companyId: company, repId: raisedFor || undefined }).then(
      (outcome) => {
        if (!cancelled && outcome.ok && outcome.data) {
          setPeople({ companyId: company, choices: outcome.data });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [company, raisedFor, guarded]);

  const contacts = people?.companyId === company ? people.choices : null;
  const addressedTo =
    (contactPick?.companyId === company ? contactPick.value : "") || contacts?.only || "";
  /*
   * "Nobody in particular" is an OPTION and not the empty state, for the same
   * reason it is one on the log dialog: without it a rep who picks the wrong
   * person cannot put the field back — a searchable select has no way of
   * un-picking, so the placeholder is reachable only before the first choice.
   * A price addressed to the company rather than to a person is a real answer,
   * so it has to be an answer he can give twice.
   */
  const addressees = [
    { value: NOBODY, label: t("quotations.noContact") },
    ...(contacts?.people ?? []),
  ];

  // Which store this is priced out of (SPEC §3). Opens on the paper's own when
  // there is one, and otherwise on the first store — never on nothing, because
  // there is no such thing as a price out of nowhere.
  const [warehouse, setWarehouse] = useState(
    existing?.warehouseId || lookups.defaultWarehouse || "",
  );

  /*
   * There was an offer here — "Copy the items from Q-12", which filled this
   * form with that quotation's lines and its prices for the rep to change
   * (D74). SPEC §3 took it away: nothing is ever carried forward from a
   * previous record into a new one, and a price is exactly the thing that
   * arrives looking checked. What stays is the offer inside THIS record — a new
   * line opens on the sheet above it — because that is the paper he is writing
   * now, not one he wrote in the spring (D163).
   */
  const totals = useMemo(() => quotationTotals(lines, services), [lines, services]);

  return (
    <form
      ref={form}
      action={submit}
      // The browser's own validation is off: it refuses the submit before the
      // action runs and answers in the BROWSER's language (DESIGN §5).
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      <input type="hidden" name="companyId" value={company} />
      {project ? <input type="hidden" name="projectId" value={project} /> : null}
      {mode !== "request" && existing ? (
        <input type="hidden" name="quotationId" value={existing.quotationId} />
      ) : null}
      {/* One field for all the lines: FormData has no shape for a list of
          objects that survives the round trip (src/actions/quotations.ts). */}
      <input type="hidden" name="items" value={linesPayload(lines)} />
      <input type="hidden" name="services" value={servicesPayload(services)} />
      <input type="hidden" name="credit" value={countsFor} />
      <input type="hidden" name="contactId" value={addressedTo === NOBODY ? "" : addressedTo} />
      <input type="hidden" name="warehouseId" value={warehouse} />
      {onBehalf ? <input type="hidden" name="repId" value={raisedFor} /> : null}

      <FormBody>
        {/* Whom it is for, first and on a row of its own (SPEC §3 P13): the
            answer every list under it follows. Drawn one column wide on the
            band's own grid, so it lines up with the customer beneath it. */}
        {onBehalf ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RaisedForField
              people={onBehalf.people}
              eligible={eligible}
              value={raisedFor}
              onChange={(value) => {
                setForPick(value);
                setPickedCompany("");
                setChosen("");
              }}
              disabled={pending}
              error={fieldErrors.repId}
            />
            {eligible.length === 0 ? (
              <p className="self-end text-sm text-muted-foreground sm:col-span-1 lg:col-span-3">
                {t("common.onBehalf.nobodyMay")}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Who and where, in one band: the customer, the job, who at the
            customer the paper goes to, and which store it comes out of (SPEC
            §3, P12-9). One-line answers about the whole quotation, so they sit
            two across from `sm` and four across on the wide desk dialog, where a
            choice the width of the line table would be a field a mile long. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Three ways in, and each renders only what it does not already know
            (P12-9): from the Quotations screen both, from a customer's drawer
            the job alone, from a job's drawer neither. */}
        {targets && !companyId ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label id="quotation-company-label">{t("common.company")}</Label>
            <SearchableSelect
              aria-labelledby="quotation-company-label"
              aria-describedby={fieldErrors.companyId ? "quotation-company-error" : undefined}
              invalid={fieldErrors.companyId ? true : undefined}
              options={offered?.companies ?? []}
              value={pickedCompany}
              // The job goes with the customer: one belongs to the other, and a
              // job left behind from the last choice would file this price
              // against a customer nobody picked.
              onChange={(value) => {
                setPickedCompany(value);
                setChosen("");
              }}
              // Nothing to choose until she has said whom it is for.
              disabled={pending || Boolean(onBehalf && !raisedFor)}
              placeholder={t("common.pickCompany")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
            {fieldErrors.companyId ? (
              <p id="quotation-company-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.companyId}
              </p>
            ) : null}
          </div>
        ) : null}

        {targets && !projectId ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label id="quotation-project-label">{t("common.project")}</Label>
            <SearchableSelect
              aria-labelledby="quotation-project-label"
              aria-describedby={fieldErrors.projectId ? "quotation-project-error" : undefined}
              invalid={fieldErrors.projectId ? true : undefined}
              options={jobs}
              value={chosen}
              onChange={setChosen}
              // Nothing to choose from until a customer is named: a list of
              // every job in the building is what this field used to be.
              disabled={pending || !company}
              placeholder={
                company ? t("quotations.pickProject") : t("common.pickCompanyFirst")
              }
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("quotations.noProjects")}
            />
            {fieldErrors.projectId ? (
              <p id="quotation-project-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.projectId}
              </p>
            ) : null}
          </div>
        ) : null}

          <div className="flex min-w-0 flex-col gap-2">
            <Label id="quotation-contact-label">{t("common.contact")}</Label>
            <SearchableSelect
              aria-labelledby="quotation-contact-label"
              options={addressees}
              value={addressedTo}
              onChange={(value) =>
                setContactPick(company ? { companyId: company, value } : null)
              }
              disabled={pending || !company}
              placeholder={t("quotations.noContact")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <Label id="quotation-warehouse-label">{t("common.warehouse")}</Label>
            <SearchableSelect
              aria-labelledby="quotation-warehouse-label"
              options={lookups.warehouses}
              value={warehouse}
              onChange={setWarehouse}
              disabled={pending}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
          </div>
        </div>

        {/* The paper's parts in one column — the panels, the services, the
            note — and what it comes to beside them on a desk, held in view while
            the items scroll (SPEC §3, P13; founder 2026-09-15). */}
        <FormSplit
          aside={
            <>
              <QuotationTotals
                sqm={totals.sqm}
                split={{ panels: totals.panels, services: totals.services }}
                subtotal={totals.subtotal}
                vat={totals.vat}
                total={totals.total}
              />

              {/* Under the totals, because that is the sentence it finishes: this
                  much paper, and it counts for him (D148). */}
              <CreditField
                people={choices?.people ?? []}
                value={countsFor}
                onChange={(next) => setCreditPick(creditKey ? { key: creditKey, value: next } : null)}
                withoutTarget={choices?.withoutTarget ?? []}
                earnsNothing={choices?.mineEarnsNothing ?? false}
                id="quotation-credit"
              />

              {/* The number SMAC gave it, which is the act of issuing it (S31). Only
                  she sees this field, and it is never prefilled on a revision: SMAC
                  gives a revision a number of its own. Empty on an EDIT too, which
                  she never reaches — her own paper is issued the moment she raises
                  it, so there is no request of hers waiting to be edited. Beside
                  the figures it issues, over the button that issues them. */}
              {issuesDirectly ? (
                <Field data-invalid={fieldErrors.smacNumber ? true : undefined}>
                  <FieldLabel htmlFor="quotation-smac">{t("common.smacNumber")}</FieldLabel>
                  <Input
                    id="quotation-smac"
                    name="smacNumber"
                    // The same three as the SMAC prompt on the queue, for the same
                    // reasons: the number is typed, so whichever script it is typed in
                    // decides which way it runs; it is a code, so there is nothing to
                    // correct and nothing to suggest.
                    dir="auto"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={pending}
                    aria-invalid={fieldErrors.smacNumber ? true : undefined}
                    aria-describedby={fieldErrors.smacNumber ? "quotation-smac-error" : undefined}
                    placeholder={t("common.asSmacIssuedIt")}
                  />
                  <FieldError id="quotation-smac-error">{fieldErrors.smacNumber}</FieldError>
                </Field>
              ) : null}
            </>
          }
        >
          <FormSection title={t("quotations.panels")}>
            <QuotationLines
              lookups={lookups}
              lines={lines}
              onChange={setLines}
              disabled={pending}
              refused={lineRefusal("items", fieldErrors)}
            />
          </FormSection>

          <QuotationServices
            choices={serviceChoices}
            services={services}
            subtotal={totals.services}
            onChange={setServices}
            disabled={pending}
            refused={lineRefusal("services", fieldErrors)}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="quotation-notes">
              {t(issuesDirectly ? "quotations.notesOwn" : "quotations.notesToCoordinator")}
            </Label>
            <Textarea
              id="quotation-notes"
              name="notes"
              rows={3}
              disabled={pending}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t(
                issuesDirectly ? "quotations.notesOwnPlaceholder" : "quotations.notesPlaceholder",
              )}
            />
          </div>
        </FormSplit>
      </FormBody>

      <FormFooter
        error={error}
        pending={pending}
        onCancel={onCancel}
        confirmLabel={issuesDirectly ? t("quotations.issue") : undefined}
        summary={<PaperSummary sqm={totals.sqm} total={totals.total} />}
      />
    </form>
  );
}
