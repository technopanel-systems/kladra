"use client";

import { Check, FileText, Pencil, PenLine, RotateCcw, Undo2, X } from "lucide-react";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  cancelQuotationAction,
  correctQuotationNumberAction,
  decideQuotationAction,
  issueQuotationAction,
  sendBackQuotationAction,
} from "@/actions/quotations";
import {
  RequestQuotationDialog,
  type QuotationDraft,
} from "@/components/quotations/request-quotation-dialog";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { PromptDialog } from "@/components/ui-ext/prompt-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { QuotationStatus } from "@/lib/quotations";
import type { ActionResult } from "@/lib/types";

/**
 * What each person may do to a quotation, and nothing else.
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
}: {
  quotation: {
    id: string;
    label: string;
    status: QuotationStatus;
    companyId: string;
    /** Under the SMAC prompts' titles: whose number is being typed (D98). */
    companyName: string;
    projectId: string | null;
    isLatest: boolean;
    /** SMAC's number, once it has one — the thing she may correct (D88). */
    smacNumber: string | null;
    draft: QuotationDraft;
  };
  scope: ActionScope;
}) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const { id, label, status } = quotation;
  const waiting = status === "requested";
  const withTheRep = status === "requested" || status === "returned";
  const issued = status === "issued";
  const answered = status === "accepted" || status === "rejected";

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

  return (
    <div className="flex flex-wrap gap-2">
      {scope.coordinator && waiting ? (
        <>
          <PromptDialog
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
            onDone={refresh}
          />
          <PromptDialog
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
            onDone={refresh}
          />
        </>
      ) : null}

      {scope.owner && withTheRep ? (
        <>
          <RequestQuotationDialog
            companyId={quotation.companyId}
            projectId={quotation.projectId}
            mode="edit"
            existing={quotation.draft}
            trigger={
              <Button variant="outline">
                <Pencil aria-hidden="true" />
                {t("quotations.editRequest")}
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button variant="outline">
                <X aria-hidden="true" />
                {t("quotations.cancel")}
              </Button>
            }
            title={t("quotations.cancelTitle", { label })}
            description={t("quotations.cancelHint")}
            confirmLabel={t("quotations.cancel")}
            successMessage={t("quotations.cancelled", { label })}
            onConfirm={withId(cancelQuotationAction)}
            onDone={refresh}
          />
        </>
      ) : null}

      {scope.owner && issued ? (
        <>
          <ConfirmDialog
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
            onDone={refresh}
          />
          <PromptDialog
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
            confirmLabel={t("quotations.rejected")}
            successMessage={t("quotations.rejectedDone", { label })}
            onConfirm={(reason) =>
              withId(decideQuotationAction, { decision: "rejected", reason })()
            }
            onDone={refresh}
          />
        </>
      ) : null}

      {scope.owner && quotation.isLatest && (issued || answered) ? (
        <RequestQuotationDialog
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
        />
      ) : null}

      {/* Hers alone, and only once there is a number to correct (D88). Quiet,
          because it is the exception on this row, not one of its two actions. */}
      {scope.coordinator && (issued || answered) && quotation.smacNumber ? (
        <PromptDialog
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
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}
