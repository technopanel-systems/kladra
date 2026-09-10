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
import { QuotationTotals } from "@/components/quotations/quotation-totals";
import { useSubmitAction, useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { useQuotationLookups } from "@/components/ui-ext/form-lookups";
import { CreditField } from "@/components/ui-ext/credit-field";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { quotationTotals } from "@/lib/money";
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
      if (quotationId) router.push(`/quotations?open=${quotationId}`);
      else router.refresh();
    },
    [mode, issuesDirectly, router, t],
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
      trigger={
        trigger ?? (
          <Button variant="outline">
            <FileText aria-hidden="true" />
            {t(issuesDirectly ? "quotations.issueOwn" : "quotations.request")}
          </Button>
        )
      }
    >
      {failed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : lookups ? (
        <RequestForm
          companyId={companyId ?? null}
          projectId={projectId ?? null}
          targets={targets}
          mode={mode}
          existing={existing}
          issuesDirectly={issuesDirectly}
          lookups={lookups}
          onSaved={onSaved}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <DialogFormSkeleton rows={6} />
      )}
    </ResponsiveDialog>
  );
}

function RequestForm({
  companyId,
  projectId,
  targets,
  mode,
  existing,
  issuesDirectly,
  lookups,
  onSaved,
  onCancel,
}: {
  companyId: string | null;
  projectId: string | null;
  targets?: QuotationTargets;
  mode: RequestMode;
  existing?: QuotationDraft;
  issuesDirectly: boolean;
  lookups: QuotationLookups;
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

  // The jobs of the customer in hand. Filtered here rather than fetched again:
  // the whole list came down with the screen, and a rep with a customer on the
  // phone should not wait for a round trip between two fields.
  const jobs = useMemo(
    () =>
      (targets?.projects ?? []).filter(
        (option) => splitOption(option.value)?.companyId === company,
      ),
    [targets, company],
  );

  const [lines, setLines] = useState<LineDraft[]>(() =>
    existing
      ? existing.lines.map((line, index) => ({ ...line, key: `existing-${index}` }))
      : [blankLine(lookups)],
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
  const [credit, setCredit] = useState<{ projectId: string; choices: CreditChoices } | null>(null);
  const [creditPick, setCreditPick] = useState<{ projectId: string; value: string } | null>(
    // An EDIT opens on what it already says; a REVISION does not. A revision is
    // a new quotation, and §3's rule is that nothing is ever carried forward
    // from a previous record — credit least of all, since carrying it is
    // exactly the inheriting D148 forbids.
    project && mode === "edit" && existing?.creditTo
      ? { projectId: project, value: existing.creditTo }
      : null,
  );
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    // A failure here is not an error the rep should see: the question is simply
    // not asked, and the metres go to the man raising it, as they did before.
    guarded(creditChoicesAction)({ projectId: project }).then((outcome) => {
      if (!cancelled && outcome.ok && outcome.data) {
        setCredit({ projectId: project, choices: outcome.data });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project, guarded]);

  const choices = credit?.projectId === project ? credit.choices : null;
  const countsFor = (creditPick?.projectId === project ? creditPick.value : "") || choices?.mine || "";

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
    guarded(contactChoicesAction)({ companyId: company }).then((outcome) => {
      if (!cancelled && outcome.ok && outcome.data) {
        setPeople({ companyId: company, choices: outcome.data });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [company, guarded]);

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
  const totals = useMemo(() => quotationTotals(lines), [lines]);

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
      <input type="hidden" name="credit" value={countsFor} />
      <input type="hidden" name="contactId" value={addressedTo === NOBODY ? "" : addressedTo} />
      <input type="hidden" name="warehouseId" value={warehouse} />

      <FormBody>
        {/* Three ways in, and each renders only what it does not already know
            (P12-9): from the Quotations screen both, from a customer's drawer
            the job alone, from a job's drawer neither. */}
        {targets && !companyId ? (
          <div className="flex flex-col gap-1.5">
            <Label id="quotation-company-label">{t("common.company")}</Label>
            <SearchableSelect
              aria-labelledby="quotation-company-label"
              aria-describedby={fieldErrors.companyId ? "quotation-company-error" : undefined}
              invalid={fieldErrors.companyId ? true : undefined}
              options={targets.companies}
              value={pickedCompany}
              // The job goes with the customer: one belongs to the other, and a
              // job left behind from the last choice would file this price
              // against a customer nobody picked.
              onChange={(value) => {
                setPickedCompany(value);
                setChosen("");
              }}
              disabled={pending}
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
          <div className="flex flex-col gap-1.5">
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

        {/* Who at the customer the paper goes to, and which store it comes out
            of (SPEC §3, P12-9). Side by side from `sm` up: both are one-line
            answers about the whole quotation, and neither is worth a row of its
            own on a form this tall. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
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

        <QuotationLines lookups={lookups} lines={lines} onChange={setLines} disabled={pending} />

        <QuotationTotals
          sqm={totals.sqm}
          subtotal={totals.subtotal}
          vat={totals.vat}
          total={totals.total}
        />

        {/* Under the totals, because that is the sentence it finishes: this
            much paper, and it counts for him (D148). */}
        <CreditField
          people={choices?.people ?? []}
          value={countsFor}
          onChange={(next) => setCreditPick(project ? { projectId: project, value: next } : null)}
          id="quotation-credit"
        />

        {/* The number SMAC gave it, which is the act of issuing it (S31). Only
            she sees this field, and it is never prefilled on a revision: SMAC
            gives a revision a number of its own. Empty on an EDIT too, which
            she never reaches — her own paper is issued the moment she raises
            it, so there is no request of hers waiting to be edited. */}
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

        <div className="flex flex-col gap-1.5">
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
      </FormBody>

      <FormFooter
        error={error}
        pending={pending}
        onCancel={onCancel}
        confirmLabel={issuesDirectly ? t("quotations.issue") : undefined}
      />
    </form>
  );
}
