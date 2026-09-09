"use client";

import { Copy, FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  creditChoicesAction,
  lastQuotationAction,
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
  isBlankLine,
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
import type { LastQuotation } from "@/lib/quotation-draft";
import { splitProjectOption, type PickerOption } from "@/lib/picker-option";

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

const ACTIONS = {
  request: requestQuotationAction,
  edit: updateQuotationAction,
  revise: reviseQuotationAction,
} as const;

export function RequestQuotationDialog({
  companyId,
  projectId,
  projectName,
  projects,
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
  /** Offered as the first field when the project is NOT known. */
  projects?: PickerOption[];
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
          projects={projects}
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
  projects,
  mode,
  existing,
  issuesDirectly,
  lookups,
  onSaved,
  onCancel,
}: {
  companyId: string | null;
  projectId: string | null;
  projects?: PickerOption[];
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

  // The picker carries both ids in one option, so choosing a project chooses
  // its company too. When the caller already knew them, it is not rendered.
  const [chosen, setChosen] = useState("");
  const picked = splitProjectOption(chosen);
  const company = companyId ?? picked?.companyId ?? "";
  const project = projectId ?? picked?.projectId ?? null;

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
   * The last thing this customer was quoted, and one button to start from it
   * (D74). Only on a first ask: Edit already opens on its own lines and Revise
   * on its parent's, and an offer to overwrite those is an offer to lose work.
   *
   * It follows the company rather than being fetched once, because on the
   * Quotations screen the company is not known until he picks the project.
   */
  const [answer, setAnswer] = useState<{ companyId: string; last: LastQuotation } | null>(null);
  useEffect(() => {
    if (mode !== "request" || !company) return;
    let cancelled = false;
    guarded(lastQuotationAction)(company).then((outcome) => {
      if (!cancelled && outcome.ok && outcome.data) {
        setAnswer({ companyId: company, last: outcome.data });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, company, guarded]);

  // The answer says which company it is about, so changing the project in the
  // picker takes the offer away with it rather than leaving the last customer's
  // quotation on screen under a new one's name.
  const last = answer?.companyId === company ? answer.last : null;

  /*
   * Offered only while there is nothing to lose. Copying REPLACES the lines, and
   * a control that throws away what somebody has typed either asks first or is
   * not there — this one is not there. It leaves as soon as he starts, which is
   * also when it stops being what he wants.
   */
  const copyable = last !== null && lines.length === 1 && isBlankLine(lines[0]);

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

      <FormBody>
        {projects ? (
          <div className="flex flex-col gap-1.5">
            <Label id="quotation-project-label">{t("common.project")}</Label>
            <SearchableSelect
              aria-labelledby="quotation-project-label"
              aria-describedby={fieldErrors.companyId ? "quotation-project-error" : undefined}
              invalid={fieldErrors.companyId ? true : undefined}
              options={projects}
              value={chosen}
              onChange={setChosen}
              disabled={pending}
              placeholder={t("quotations.pickProject")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("quotations.noProjects")}
            />
            {fieldErrors.companyId ? (
              <p id="quotation-project-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.companyId}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The offer belongs to the items, so it sits in their block and not in
            the form's own rhythm: eight pixels above the first card and the
            form's sixteen below the heading, which is the difference between a
            button about the items and a button floating between two things. */}
        <div className="flex flex-col gap-2">
          {copyable && last ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                setLines(last.lines.map((line, index) => ({ ...line, key: `copied-${index}` })))
              }
              className="self-start"
            >
              <Copy aria-hidden="true" />
              {t("quotations.copyItemsFrom", { label: last.label })}
            </Button>
          ) : null}

          <QuotationLines
            lookups={lookups}
            lines={lines}
            onChange={setLines}
            disabled={pending}
          />
        </div>

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
