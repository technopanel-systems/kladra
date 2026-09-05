import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { DispatchMiniList } from "@/components/dispatches/dispatch-mini-list";
import { RequestDispatchDialog } from "@/components/dispatches/request-dispatch-dialog";
import { QuotationSheet } from "@/components/quotations/quotations-table";
import { Button } from "@/components/ui/button";
import { NotAllowed, requireUser } from "@/lib/authz";
import { mayQuote } from "@/lib/floor";
import { listDispatchesForQuotation } from "@/lib/dispatches";
import { getQuotation } from "@/lib/quotations";
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

  const owner = mayQuote(user, quotation.companyRepId);
  const [dispatches, standing] = await Promise.all([
    listDispatchesForQuotation(user, quotation.id, locale),
    quotationStanding(quotation.id),
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
  const canSend =
    owner &&
    quotation.isLatest &&
    (quotation.status === "issued" || quotation.status === "accepted");

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
      quotation={quotation}
      standing={standing}
      items={quotation.items}
      revisions={quotation.revisions}
      // What Edit and Revise open on: the lines as they are, by id rather than
      // by the words on screen, so renaming a class in Lookups cannot move one.
      draft={{
        quotationId: quotation.id,
        notes: quotation.notes ?? "",
        lines: quotation.items.map((item) => ({
          colourCode: item.colourCode,
          supplierId: String(item.supplierId),
          fireRatingId: String(item.fireRatingId),
          classId: String(item.classId),
          thicknessId: String(item.thicknessId),
          qty: String(item.qty),
          width: item.width,
          length: item.length,
          pricePerSqm: item.pricePerSqm,
        })),
      }}
      scope={{
        coordinator: user.role === "coordinator",
        // The rep whose COMPANY it is — not whoever raised it, and not a
        // manager, who sees everything and owns none of it (S8). The same fact
        // the actions check, so nothing is offered that would then be refused.
        owner,
      }}
    />
  );
}
