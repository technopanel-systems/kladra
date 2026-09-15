"use client";

import { Check, Pencil, PenLine, X } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { withTheRep } from "@/lib/with-the-rep";
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
import { dispatchBrand, type DispatchScope } from "@/components/dispatches/dispatch-brand";
import { ToneNote } from "@/components/dispatches/tone-note";
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
 * to change his own request while it is still waiting or after she refused it —
 * once she has approved it it is finished, and a change after that is a new
 * dispatch (S41). A dispatch has no withdraw, on purpose (D37).
 *
 * Nothing is offered and then refused: a button appears when the status and the
 * person both allow it, and does not otherwise (DESIGN §5).
 *
 * **One row, in the drawer's order** (P13-G6, S12.5; the shape S12.2 and S12.3
 * gave the company and project drawers). The one brand button first — Approve
 * for her, the corrected request for him when she refused it, otherwise the
 * report — then what is secondary beside it, and the answer that ENDS somebody's
 * request last, apart at the row's far end, in the tint: Refuse stood at the
 * weight of Approve, a finger's width from it. It stays a button rather than an
 * item in a menu, because it is one of the only two answers she gives all day,
 * and a menu that holds one of two daily acts hides half of her desk.
 */

export function DispatchActions({
  dispatch,
  scope,
  report,
}: {
  dispatch: {
    id: string;
    label: string;
    status: DispatchStatus;
    /** Under the SMAC prompts' titles: whose number is being typed (D98). */
    companyName: string;
    /** SMAC's dispatch number, once approved — the thing she may correct (D88). */
    smacDispatchNumber: string | null;
    /** The quotation was revised after this was raised: approval would refuse it (D85). */
    superseded: boolean;
    draft: DispatchDraft;
  };
  scope: DispatchScope;
  /** "Add report", built on the server, which knows whether he may write one. */
  report?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const { id, label, status, superseded } = dispatch;
  /** Hers to answer: only while it is waiting. */
  const waiting = status === "submitted";
  /**
   * His to change: waiting on her, or refused by her (SPEC §3, P12-10). A
   * refusal is the dispatch chain's send-back — he corrects the request and it
   * goes back on her desk as the same number — so the door out of it is the one
   * that raised it, exactly as a sent-back quotation's is.
   */
  const his = withTheRep(status);
  const brand = dispatchBrand(status, scope);

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

  const approve = scope.coordinator && waiting;
  const edit = scope.owner && his;
  const correct = scope.coordinator && status === "approved" && Boolean(dispatch.smacDispatchNumber);
  if (!approve && !edit && !correct && !report) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Said before the press (D112, P11E): approval refuses a dispatch whose
          quotation has a later revision (D85), and until now she learned that
          from the refusal. The button stays, disabled, so the sentence has a
          subject; refusing is still hers. A dot and the words, never the words
          painted amber (DESIGN §1: TONE_TEXT is for a late date or figure). */}
      {approve && superseded ? (
        <ToneNote tone="wait" role="status" slot="superseded-note" className="text-sm">
          {t("dispatches.supersededQuotation")}
        </ToneNote>
      ) : null}

      <div
        role="group"
        aria-label={t("dispatches.actions")}
        className="flex flex-wrap items-center gap-2"
      >
        {approve ? (
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
        ) : null}

        {/* His to correct and send again, from a quotation or direct alike: the
            dialog opens on the load as it stands (SPEC §3, P13). */}
        {edit ? (
          <RequestDispatchDialog
            mode="edit"
            existing={dispatch.draft}
            trigger={
              <Button variant={brand === "edit" ? "brand" : "outline"}>
                <Pencil aria-hidden="true" />
                {t("dispatches.editRequest")}
              </Button>
            }
          />
        ) : null}

        {report}

        {/* Hers alone, and only on an approved one (D88): a correction of the
            number in the strip above, quiet, because it is rare. */}
        {correct ? (
          <PromptDialog
            trigger={
              <Button variant="outline">
                <PenLine aria-hidden="true" />
                {t("dispatches.correctNumber")}
              </Button>
            }
            title={t("dispatches.correctNumberTitle", { label })}
            context={dispatch.companyName}
            description={t("dispatches.correctNumberHint")}
            label={t("common.smacDispatchNumber")}
            placeholder={t("common.asSmacIssuedIt")}
            initialValue={dispatch.smacDispatchNumber ?? ""}
            confirmLabel={t("dispatches.correctNumber")}
            successMessage={t("dispatches.numberCorrected", { label })}
            onConfirm={(smacDispatchNumber) =>
              withId(correctDispatchNumberAction, { smacDispatchNumber })()
            }
            onDone={refresh}
          />
        ) : null}

        {/* The answer that ends his request, last and apart, in the tint: it
            sends the load back to him with her words (S53), and it is never a
            thumb's slip from Approve. */}
        {approve ? (
          <span className="ms-auto flex">
            <PromptDialog
              trigger={
                <Button variant="destructive">
                  <X aria-hidden="true" />
                  {t("dispatches.refuse")}
                </Button>
              }
              title={t("dispatches.refuseTitle", { label })}
              context={dispatch.companyName}
              description={t("dispatches.refuseHint")}
              label={t("common.reason")}
              multiline
              destructive
              confirmLabel={t("dispatches.refuse")}
              successMessage={t("dispatches.refused", { label })}
              onConfirm={(reason) => withId(refuseDispatchAction, { reason })()}
              onDone={refresh}
            />
          </span>
        ) : null}
      </div>
    </div>
  );
}
