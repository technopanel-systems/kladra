"use client";

import { Check, FileText, Pencil, PenLine, RotateCcw, Undo2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { withTheRep } from "@/lib/with-the-rep";
import { useTranslations } from "next-intl";
import {
  cancelQuotationAction,
  correctQuotationNumberAction,
  decideQuotationAction,
  issueQuotationAction,
  sendBackQuotationAction,
} from "@/actions/quotations";
import { useFlashQuotation } from "@/components/quotations/quotation-flash";
import {
  RequestQuotationDialog,
  type QuotationDraft,
} from "@/components/quotations/request-quotation-dialog";
import { ReportButton } from "@/components/reports/report-dialog";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { PromptDialog } from "@/components/ui-ext/prompt-dialog";
import { RowMenu } from "@/components/ui-ext/row-menu";
import { useOpener } from "@/components/ui-ext/use-opener";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { QuotationStatus } from "@/lib/quotations";
import type { ActionResult } from "@/lib/types";

/**
 * What each person may do to a quotation, and nothing else — the drawer's action
 * row, drawn in the shape the company and project drawers have (P13-G6, S12.4).
 *
 * The coordinator has exactly two actions, and they are hers alone: type SMAC's
 * number back, which issues it, or send it back with a reason (SPEC §3, S28,
 * S29). The customer's answer is the rep's action, on the rep's screen, after
 * issue (§3, S36).
 *
 * Nothing here is offered and then refused. A button appears when the status
 * and the person both allow it, and does not otherwise — a control that cannot
 * be used is not rendered as a control (DESIGN §5). That is also why the whole
 * set is decided here rather than in each dialog: the rules are one paragraph
 * of the spec and they belong in one place.
 *
 * **One brand button, and it is what the paper is waiting on from this reader.**
 * Issue, where a request is on her desk; Edit request, where she sent it back to
 * him; Customer accepted, where it is out with the customer and the answer is
 * his to write down. Where the paper waits on nothing from him — it is with the
 * desk, or it has been answered — the brand is Add report, as it is on the
 * company's and the project's drawers, because talking to the customer about
 * the paper is then the work. Every other act is secondary beside it.
 *
 * **Withdraw goes last, apart, in the tint.** It ends the request, and it stood
 * in the row at the weight of Edit request, a finger's width from it. It is the
 * menu's last act now ("More for Q-12"), its confirmation hosted here and in the
 * tint, with focus handed back to the menu's button when it closes (S12.9's row
 * menu, S12.3's drawer). The other acts stay in sight: each is the next step of a
 * chain somebody is waiting on, and Correct the number is the coordinator's
 * quiet exception, a prompt the kit opens only from its own button.
 */

export type ActionScope = {
  /** She runs the chain: issue and send back (S9). */
  coordinator: boolean;
  /** His company, so his to edit, decide and revise (S8). */
  owner: boolean;
  /**
   * Whoever puts their own paper out (SPEC §3) — the coordinator, since there
   * is nobody behind her to ask. Asked of the ROLE by `issuesOwnQuotations`
   * and not read off `coordinator` above, which happens to be the same people
   * today and is a different question: one is "does she run the queue", the
   * other is "does she need a queue at all". Two questions that share an answer
   * are still two questions (D42).
   */
  issuesDirectly: boolean;
};

export function QuotationActions({
  quotation,
  scope,
  reportable,
}: {
  quotation: {
    id: string;
    label: string;
    status: QuotationStatus;
    companyId: string;
    /** Under the SMAC prompts' titles: whose number is being typed (D98). */
    companyName: string;
    projectId: string;
    isLatest: boolean;
    /** SMAC's number, once it has one — the thing she may correct (D88). */
    smacNumber: string | null;
    draft: QuotationDraft;
  };
  scope: ActionScope;
  /**
   * Whether this reader may write a report about this paper — decided on the
   * server, which asks the same sentence the report's action asks (SPEC §3 P13).
   */
  reportable: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const flash = useFlashQuotation();
  const [withdrawing, setWithdrawing] = useState(false);
  const remember = useOpener(withdrawing);

  const { id, label, status } = quotation;

  /** After an act: the row behind the drawer flashes, and both halves re-read. */
  function done() {
    flash(id);
    router.refresh();
  }

  const waiting = status === "requested";
  // Still his to change: asked for and unanswered, or sent back. The dispatch
  // drawer asks the same question of its own two states (`withTheRep`).
  const his = scope.owner && withTheRep(status);
  const issued = status === "issued";
  const answered = status === "accepted" || status === "rejected";

  // What the paper is waiting on from THIS reader, which is the brand.
  const issuing = scope.coordinator && waiting;
  const fixing = his && status === "returned";
  const answering = scope.owner && issued;
  const owed = issuing || fixing || answering;

  function withId(
    action: (prev: ActionResult<{ quotationId: string }> | null, form: FormData) => Promise<
      ActionResult<{ quotationId: string }>
    >,
    extra?: Record<string, string>,
  ): () => Promise<ActionResult<unknown>> {
    return async () => {
      const form = new FormData();
      form.set("quotationId", id);
      for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
      return action(null, form);
    };
  }

  const report = reportable ? (
    // A report about this paper, opening on its customer, its job and it
    // (SPEC §3, P13).
    <ReportButton
      key="report"
      companyId={quotation.companyId}
      companyName={quotation.companyName}
      projectId={quotation.projectId}
      quotationId={quotation.id}
      variant={owed ? "outline" : "brand"}
      icon
    >
      {t("common.addReport")}
    </ReportButton>
  ) : null;

  const acts: ReactNode[] = [];
  // Where nothing is owed, the report leads.
  if (report && !owed) acts.push(report);

  if (issuing) {
    acts.push(
      <PromptDialog
        key="issue"
        trigger={
          <Button variant="brand">
            <FileText aria-hidden="true" />
            {t("quotations.issue")}
          </Button>
        }
        title={t("quotations.issueTitle", { label })}
        context={quotation.companyName}
        description={t("quotations.issueHint")}
        label={t("common.smacNumber")}
        placeholder={t("common.asSmacIssuedIt")}
        confirmLabel={t("quotations.issue")}
        successMessage={t("quotations.issued", { label })}
        onConfirm={(smacNumber) => withId(issueQuotationAction, { smacNumber })()}
        onDone={done}
      />,
      <PromptDialog
        key="send-back"
        trigger={
          <Button variant="outline">
            <Undo2 aria-hidden="true" />
            {t("quotations.sendBack")}
          </Button>
        }
        title={t("quotations.sendBackTitle", { label })}
        description={t("quotations.sendBackHint")}
        label={t("common.reason")}
        multiline
        confirmLabel={t("quotations.sendBack")}
        successMessage={t("quotations.sentBack", { label })}
        onConfirm={(reason) => withId(sendBackQuotationAction, { reason })()}
        onDone={done}
      />,
    );
  }

  if (his) {
    acts.push(
      <RequestQuotationDialog
        key="edit"
        companyId={quotation.companyId}
        projectId={quotation.projectId}
        mode="edit"
        existing={quotation.draft}
        trigger={
          <Button variant={fixing ? "brand" : "outline"}>
            <Pencil aria-hidden="true" />
            {t("quotations.editRequest")}
          </Button>
        }
      />,
    );
  }

  if (answering) {
    acts.push(
      <ConfirmDialog
        key="accepted"
        trigger={
          <Button variant="brand">
            <Check aria-hidden="true" />
            {t("quotations.accepted")}
          </Button>
        }
        title={t("quotations.acceptTitle", { label })}
        description={t("quotations.acceptHint")}
        confirmLabel={t("quotations.accepted")}
        successMessage={t("quotations.acceptedDone", { label })}
        onConfirm={withId(decideQuotationAction, { decision: "accepted" })}
        onDone={done}
      />,
      <PromptDialog
        key="rejected"
        trigger={
          <Button variant="outline">
            <X aria-hidden="true" />
            {t("quotations.rejected")}
          </Button>
        }
        title={t("quotations.rejectTitle", { label })}
        description={t("quotations.rejectHint")}
        label={t("common.reason")}
        multiline
        // The answer that ends the chase, in the tint as Mark lost is: the
        // brand is for the answer the paper was waiting on (D202).
        destructive
        confirmLabel={t("quotations.rejected")}
        successMessage={t("quotations.rejectedDone", { label })}
        onConfirm={(reason) => withId(decideQuotationAction, { decision: "rejected", reason })()}
        onDone={done}
      />,
    );
  }

  if (scope.owner && quotation.isLatest && (issued || answered)) {
    acts.push(
      <RequestQuotationDialog
        key="revise"
        companyId={quotation.companyId}
        projectId={quotation.projectId}
        mode="revise"
        existing={quotation.draft}
        issuesDirectly={scope.issuesDirectly}
        trigger={
          <Button variant="outline">
            <RotateCcw aria-hidden="true" />
            {t("quotations.revise")}
          </Button>
        }
      />,
    );
  }

  // Where something is owed, the report follows the chain's own acts.
  if (report && owed) acts.push(report);

  // Hers alone, and only once there is a number to correct (D88). Quiet,
  // because it is the exception on this row, not one of its two actions.
  if (scope.coordinator && (issued || answered) && quotation.smacNumber) {
    acts.push(
      <PromptDialog
        key="correct"
        trigger={
          <Button variant="ghost" className="text-muted-foreground">
            <PenLine aria-hidden="true" />
            {t("quotations.correctNumber")}
          </Button>
        }
        title={t("quotations.correctNumberTitle", { label })}
        context={quotation.companyName}
        description={t("quotations.correctNumberHint")}
        label={t("common.smacNumber")}
        placeholder={t("common.asSmacIssuedIt")}
        initialValue={quotation.smacNumber}
        confirmLabel={t("quotations.correctNumber")}
        successMessage={t("quotations.numberCorrected", { label })}
        onConfirm={(smacNumber) => withId(correctQuotationNumberAction, { smacNumber })()}
        onDone={done}
      />,
    );
  }

  // A reader who may do nothing to this paper — the manager reading the floor —
  // gets no row at all, not an empty one.
  if (acts.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t("quotations.actions")}
      className="flex flex-wrap items-center gap-2"
    >
      {acts}

      {/* The menu at the row's end, holding the act that ends the request. A
          reader who may not withdraw gets no menu at all, not an empty one. */}
      {his ? (
        <span className="ms-auto flex">
          <RowMenu
            label={t("common.moreFor", { name: label })}
            items={[]}
            end={{
              label: t("quotations.cancel"),
              icon: X,
              destructive: true,
              onSelect: (opener) => {
                remember(opener);
                setWithdrawing(true);
              },
            }}
            size="head"
          />
          <ConfirmDialog
            open={withdrawing}
            onOpenChange={(open) => {
              if (!open) setWithdrawing(false);
            }}
            destructive
            title={t("quotations.cancelTitle", { label })}
            description={t("quotations.cancelHint")}
            confirmLabel={t("quotations.cancel")}
            successMessage={t("quotations.cancelled", { label })}
            onConfirm={withId(cancelQuotationAction)}
            onDone={done}
          />
        </span>
      ) : null}
    </div>
  );
}
