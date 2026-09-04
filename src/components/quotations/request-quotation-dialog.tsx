"use client";

import { FileText } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { QuotationLookups } from "@/actions/forms";
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
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { useQuotationLookups } from "@/components/ui-ext/form-lookups";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { quotationTotals } from "@/lib/money";
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
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useQuotationLookups(open);

  const onSaved = useCallback(
    (quotationId: string | undefined) => {
      toast.success(t(mode === "revise" ? "quotations.revised" : "quotations.requested"));
      setOpen(false);
      if (quotationId) router.push(`/quotations?open=${quotationId}`);
      else router.refresh();
    },
    [mode, router, t],
  );

  const title =
    mode === "edit"
      ? t("quotations.editRequest")
      : mode === "revise"
        ? t("quotations.revise")
        : projectName
          ? t("quotations.requestFor", { project: projectName })
          : t("quotations.request");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={t("quotations.requestHint")}
      trigger={
        trigger ?? (
          <Button variant="outline">
            <FileText aria-hidden="true" />
            {t("quotations.request")}
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
  lookups,
  onSaved,
  onCancel,
}: {
  companyId: string | null;
  projectId: string | null;
  projects?: PickerOption[];
  mode: RequestMode;
  existing?: QuotationDraft;
  lookups: QuotationLookups;
  onSaved: (quotationId: string | undefined) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  // Not useActionState: raising a revision removes the button this dialog hangs
  // off, so the answer has to survive the form's own unmount (useSubmitAction).
  const { submit, pending, error, fieldErrors } = useSubmitAction(ACTIONS[mode], (data) =>
    onSaved(data?.quotationId),
  );

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

        <QuotationLines
          lookups={lookups}
          lines={lines}
          onChange={setLines}
          disabled={pending}
        />

        <QuotationTotals
          sqm={totals.sqm}
          subtotal={totals.subtotal}
          vat={totals.vat}
          total={totals.total}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quotation-notes">{t("quotations.notesToCoordinator")}</Label>
          <Textarea
            id="quotation-notes"
            name="notes"
            rows={3}
            disabled={pending}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("quotations.notesPlaceholder")}
          />
        </div>
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onCancel} />
    </form>
  );
}
