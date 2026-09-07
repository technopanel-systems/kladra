"use client";

import { Check, Pencil, PenLine, X } from "lucide-react";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  approveDispatchAction,
  correctDispatchNumberAction,
  refuseDispatchAction,
} from "@/actions/dispatches";
import {
  RequestDispatchDialog,
  type DispatchDraft,
} from "@/components/dispatches/request-dispatch-dialog";
import { PromptDialog } from "@/components/ui-ext/prompt-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { DispatchStatus } from "@/lib/dispatches";
import { TONE_TEXT } from "@/lib/state-tone";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * What each person may do to a dispatch, and nothing else (SPEC S39).
 *
 * The coordinator has two actions and they are hers alone: approve it with
 * SMAC's dispatch number, or refuse it with a reason. The rep's only action is
 * to change his own request while it is still waiting — once she has answered
 * it is finished, and a change after that is a new dispatch (S41).
 *
 * Nothing is offered and then refused: a button appears when the status and the
 * person both allow it, and does not otherwise (DESIGN §5).
 */

export type DispatchScope = {
  /** She runs the chain: approve and refuse (S9). */
  coordinator: boolean;
  /** His company, so his request to change (S8). */
  owner: boolean;
};

export function DispatchActions({
  dispatch,
  scope,
}: {
  dispatch: {
    id: string;
    label: string;
    status: DispatchStatus;
    /** Under the SMAC prompts' titles: whose number is being typed (D98). */
    companyName: string;
    quotationId: string;
    quotationLabel: string;
    /** SMAC's dispatch number, once approved — the thing she may correct (D88). */
    smacDispatchNumber: string | null;
    /** The quotation was revised after this was raised: approval would refuse it (D85). */
    superseded: boolean;
    draft: DispatchDraft;
  };
  scope: DispatchScope;
}) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const { id, label, status, superseded } = dispatch;
  const waiting = status === "submitted";

  function withId(
    action: (
      prev: ActionResult<{ dispatchId: string }> | null,
      form: FormData,
    ) => Promise<ActionResult<{ dispatchId: string }>>,
    extra: Record<string, string>,
  ): () => Promise<ActionResult<unknown>> {
    return async () => {
      const form = new FormData();
      form.set("dispatchId", id);
      for (const [key, value] of Object.entries(extra)) form.set(key, value);
      return action(null, form);
    };
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Said before the press (D112, P11E): approval refuses a dispatch whose
          quotation has a later revision (D85), and until now she learned that
          from the refusal. The button stays, disabled, so the sentence has a
          subject; refusing is still hers. */}
      {scope.coordinator && waiting && superseded ? (
        <p role="status" data-slot="superseded-note" className={cn("basis-full text-sm", TONE_TEXT.wait)}>
          {t("dispatches.supersededQuotation")}
        </p>
      ) : null}
      {scope.coordinator && waiting ? (
        <>
          <PromptDialog
            trigger={
              <Button variant="brand" disabled={superseded}>
                <Check aria-hidden="true" />
                {t("dispatches.approve")}
              </Button>
            }
            title={t("dispatches.approveTitle", { label })}
            context={dispatch.companyName}
            description={t("dispatches.approveHint")}
            label={t("common.smacDispatchNumber")}
            placeholder={t("common.asSmacIssuedIt")}
            confirmLabel={t("dispatches.approve")}
            successMessage={t("dispatches.approved", { label })}
            onConfirm={(smacDispatchNumber) =>
              withId(approveDispatchAction, { smacDispatchNumber })()
            }
            onDone={refresh}
          />
          <PromptDialog
            trigger={
              <Button variant="outline">
                <X aria-hidden="true" />
                {t("dispatches.refuse")}
              </Button>
            }
            title={t("dispatches.refuseTitle", { label })}
            description={t("dispatches.refuseHint")}
            label={t("common.reason")}
            multiline
            confirmLabel={t("dispatches.refuse")}
            successMessage={t("dispatches.refused", { label })}
            onConfirm={(reason) => withId(refuseDispatchAction, { reason })()}
            onDone={refresh}
          />
        </>
      ) : null}

      {scope.owner && waiting ? (
        <RequestDispatchDialog
          quotationId={dispatch.quotationId}
          quotationLabel={dispatch.quotationLabel}
          mode="edit"
          existing={dispatch.draft}
          trigger={
            <Button variant="outline">
              <Pencil aria-hidden="true" />
              {t("dispatches.editRequest")}
            </Button>
          }
        />
      ) : null}

      {/* Hers alone, and only on an approved one (D88). */}
      {scope.coordinator && status === "approved" && dispatch.smacDispatchNumber ? (
        <PromptDialog
          trigger={
            <Button variant="ghost" className="text-muted-foreground">
              <PenLine aria-hidden="true" />
              {t("dispatches.correctNumber")}
            </Button>
          }
          title={t("dispatches.correctNumberTitle", { label })}
          context={dispatch.companyName}
          description={t("dispatches.correctNumberHint")}
          label={t("common.smacDispatchNumber")}
          placeholder={t("common.asSmacIssuedIt")}
          initialValue={dispatch.smacDispatchNumber}
          confirmLabel={t("dispatches.correctNumber")}
          successMessage={t("dispatches.numberCorrected", { label })}
          onConfirm={(smacDispatchNumber) =>
            withId(correctDispatchNumberAction, { smacDispatchNumber })()
          }
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}
