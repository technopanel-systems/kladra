import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { DispatchMiniList } from "@/components/dispatches/dispatch-mini-list";
import { RequestDispatchDialog } from "@/components/dispatches/request-dispatch-dialog";
import { QuotationHistory } from "@/components/quotations/quotation-history";
import { RevisionChanges } from "@/components/quotations/revision-changes";
import { CREDIT_SPLIT } from "@/lib/credit";
import { QuotationSheet } from "@/components/quotations/quotations-table";
import { Button } from "@/components/ui/button";
import { NotAllowed, requireUser } from "@/lib/authz";
import { issuesOwnQuotations, mayWrite } from "@/lib/floor";
import { mayRaiseFor } from "@/lib/visibility";
import { listDispatchesForQuotation } from "@/lib/dispatches";
import { draftLinesFrom } from "@/lib/quotation-draft";
import { dispatchable, getQuotation, quotationHistory, revisionChanges } from "@/lib/quotations";
import { quotationStanding } from "@/lib/standing";

/**
 * The quotation drawer (DESIGN §2: work happens in a drawer over the list).
 *
 * A server component, so what it shows is read with the request that opened it
 * — `?open=<id>` is the whole state, and a refresh or a link somebody sends
 * reopens exactly this.
 *
 * It also decides what the person looking at it may do, because that is a
 * question about the reader and the row, not about the screen: the coordinator
 * runs the chain, and the rep who owns the company owns the answers on it (S8,
 * S9). The buttons themselves are in QuotationActions.
 */
export async function QuotationDrawer({ quotationId }: { quotationId: string | null }) {
  if (!quotationId) return null;

  const [user, locale, t] = await Promise.all([requireUser(), getLocale(), getTranslations()]);

  /*
   * No drawer, and no error page, over a link that no longer works — whichever
   * way it fails. An id that is not a uuid would take the cast down in
   * Postgres; a quotation on somebody else's company throws NotAllowed, and a
   * rep following a colleague's link is told there is nothing here rather than
   * shown that a quotation he cannot open exists.
   */
  if (!z.uuid().safeParse(quotationId).success) return null;

  let quotation: Awaited<ReturnType<typeof getQuotation>> = null;
  try {
    quotation = await getQuotation(user, quotationId);
  } catch (error) {
    if (!(error instanceof NotAllowed)) throw error;
  }
  if (!quotation) return null;

  // Its raiser, and nobody else. Every action this flag carries — edit, revise,
  // withdraw, record the customer's answer — belongs to whoever created the
  // record (SPEC §3, D147), and the actions behind them ask the same question.
  // It read the COMPANY's owner before, which was the same person until a
  // project could be shared: a rep put on a job would then have been shown none
  // of his own paper's buttons, and the man whose customer it is would have been
  // shown all of somebody else's.
  const owner = mayWrite(user, quotation.repId);
  const [dispatches, standing, history, changes] = await Promise.all([
    listDispatchesForQuotation(user, quotation.id, locale),
    quotationStanding(quotation.id),
    quotationHistory(quotation.id),
    revisionChanges(user, quotation),
  ]);

  // S38: goods move against paper that exists. Before it is issued there is
  // nothing to send against, so the button is absent rather than present and
  // refusing (DESIGN §5). It sits in one position whether or not anything has
  // gone out yet, because a trigger inside an empty state is destroyed by the
  // save that fills it (D35).
  //
  // And only against the revision that is live: once a quotation has been
  // revised the customer holds the new paper, and sending against the old one
  // would move goods on a price nobody agreed (S34, S35).
  //
  // And "may send" is not "may edit". Sending goods against a quotation is new
  // work on the job, which §3 gives to every rep on a shared project — not an
  // edit of somebody's record, which is only its raiser's. Read as the raiser's
  // alone, the rep whose CUSTOMER it is could not send against paper his
  // colleague had raised on his own job, while the action behind the button
  // would have allowed it: the screen refusing work the write permits, which
  // is the same defect as offering work it refuses, one mirror over (§5 #163).
  const canSend =
    mayRaiseFor(user, quotation.companyRepId, quotation.projectRepId, quotation.onProject) &&
    quotation.isLatest &&
    dispatchable(quotation.status);

  return (
    <QuotationSheet
      dispatches={
        canSend || dispatches.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("common.dispatches")}</h3>
            {canSend ? (
              <div className="flex">
                <RequestDispatchDialog
                  quotationId={quotation.id}
                  quotationLabel={quotation.label}
                  trigger={<Button variant="outline">{t("dispatches.request")}</Button>}
                />
              </div>
            ) : null}
            {dispatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dispatches.emptyForQuotation")}</p>
            ) : (
              <DispatchMiniList rows={dispatches} />
            )}
          </div>
        ) : null
      }
      history={<QuotationHistory history={history} />}
      changes={changes ? <RevisionChanges changes={changes} /> : null}
      quotation={quotation}
      credit={quotation.credit}
      standing={standing}
      items={quotation.items}
      revisions={quotation.revisions}
      // What Edit and Revise open on: the lines as they are, by id rather than
      // by the words on screen, so renaming a class in Lookups cannot move one.
      draft={{
        quotationId: quotation.id,
        notes: quotation.notes ?? "",
        lines: draftLinesFrom(quotation.items),
        // What the credit field opens on: the name it already says, or the
        // word that means everybody on the job (D148). A REVISION ignores it
        // and asks again, because nothing is carried forward from a previous
        // record (SPEC §3).
        creditTo:
          quotation.credit.length > 1 ? CREDIT_SPLIT : (quotation.credit[0]?.userId ?? undefined),
        // The store and the name it goes to, as this paper says them (P12-9).
        // A revision opens on them the same way it opens on the lines: it is
        // this paper again at a new price, not the next one after it (D10).
        warehouseId: String(quotation.warehouseId),
        contactId: quotation.contactId ?? "",
      }}
      scope={{
        coordinator: user.role === "coordinator",
        // Her revision goes out as she raises it, so the dialog behind Revise
        // asks for the SMAC number instead of joining a queue she owns (§3).
        issuesDirectly: issuesOwnQuotations(user.role),
        // The rep whose COMPANY it is — not whoever raised it, and not a
        // manager, who sees everything and owns none of it (S8). The same fact
        // the actions check, so nothing is offered that would then be refused.
        owner,
      }}
    />
  );
}
