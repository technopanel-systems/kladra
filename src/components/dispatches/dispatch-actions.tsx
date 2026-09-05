"use client";

import { Check, Pencil, X } from "lucide-react";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { approveDispatchAction, refuseDispatchAction } from "@/actions/dispatches";
import {
  RequestDispatchDialog,
  type DispatchDraft,
} from "@/components/dispatches/request-dispatch-dialog";
import { PromptDialog } from "@/components/ui-ext/prompt-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { DispatchStatus } from "@/lib/dispatches";
import type { ActionResult } from "@/lib/types";

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
    quotationId: string;
    quotationLabel: string;
    draft: DispatchDraft;
  };
  scope: DispatchScope;
}) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const { id, label, status } = dispatch;
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
    <div className="flex flex-wrap gap-2">
      {scope.coordinator && waiting ? (
        <>
          <PromptDialog
            trigger={
              <Button variant="brand">
                <Check aria-hidden="true" />
                {t("dispatches.approve")}
              </Button>
            }
            title={t("dispatches.approveTitle", { label })}
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
    </div>
  );
}
