import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { DispatchDifferences } from "@/components/dispatches/dispatch-differences";
import { DispatchHistory } from "@/components/dispatches/dispatch-history";
import { CREDIT_SPLIT } from "@/lib/credit";
import { DispatchSheet } from "@/components/dispatches/dispatches-table";
import { ReportButton } from "@/components/reports/report-dialog";
import { mayReportOn } from "@/lib/activities";
import { NotAllowed, requireUser } from "@/lib/authz";
import { mayQuote } from "@/lib/floor";
import { dispatchHistory, getDispatch } from "@/lib/dispatches";
import { draftLinesFrom, draftServicesFrom } from "@/lib/quotation-draft";

/**
 * The dispatch drawer (DESIGN §2: work happens in a drawer over the list).
 *
 * A server component, so what it shows is read with the request that opened it
 * — `?open=<id>` is the whole state, and a refresh or a link somebody sends
 * reopens exactly this.
 *
 * It also decides what the person looking at it may do: the coordinator runs
 * the chain, and the rep who owns the company owns the request on it (S8, S9).
 */
export async function DispatchDrawer({
  dispatchId,
  param,
}: {
  dispatchId: string | null;
  /** The query parameter it was opened by — "dispatch" on the queue. */
  param?: string;
}) {
  if (!dispatchId) return null;

  const [user, locale, t] = await Promise.all([requireUser(), getLocale(), getTranslations()]);

  /*
   * No drawer, and no error page, over a link that no longer works — whichever
   * way it fails. An id that is not a uuid would take the cast down in
   * Postgres; a dispatch on somebody else's company throws NotAllowed, and a
   * rep following a colleague's link is told there is nothing here rather than
   * shown that a dispatch he cannot open exists.
   */
  if (!z.uuid().safeParse(dispatchId).success) return null;

  let dispatch: Awaited<ReturnType<typeof getDispatch>> = null;
  try {
    dispatch = await getDispatch(user, dispatchId, locale);
  } catch (error) {
    if (!(error instanceof NotAllowed)) throw error;
  }
  if (!dispatch) return null;

  // Read after the row and not beside it: there is nothing to say about a
  // dispatch this person may not open, and the refusal above is what decides.
  const history = await dispatchHistory(dispatch.id);

  return (
    <DispatchSheet
      param={param}
      dispatch={dispatch}
      credit={dispatch.credit}
      items={dispatch.items}
      // What Edit opens on: the load as it stands — every line and service with
      // its own inputs, by id rather than by the words on screen, and the
      // quotation row each came from, so what differs is worked out again
      // against the same rows (SPEC §3, P13).
      draft={{
        dispatchId: dispatch.id,
        companyId: dispatch.companyId,
        companyName: dispatch.companyName,
        quotationId: dispatch.quotationId,
        quotationLabel: dispatch.quotationLabel,
        shipmentMethodId: String(dispatch.shipmentMethodId),
        warehouseId: String(dispatch.warehouseId),
        destination: dispatch.destination,
        paymentTerms: dispatch.paymentTerms,
        paymentDetail: dispatch.paymentDetail,
        paymentNote: dispatch.paymentNote,
        lines: dispatch.items.map((item) => ({
          quotationItemId: item.quotationItemId,
          ...draftLinesFrom([item])[0],
        })),
        services: dispatch.services.map((service) => ({
          quotationServiceId: service.quotationServiceId,
          ...draftServicesFrom([service])[0],
        })),
        // What the field opens on: the name it already says, or the word that
        // means everybody on the job (D148).
        creditTo:
          dispatch.credit.length > 1 ? CREDIT_SPLIT : (dispatch.credit[0]?.userId ?? undefined),
      }}
      // A node, not data: it is built on the server, where the audit log and
      // the reader's own language both live — the same reason the quotation
      // sheet takes its trail this way.
      history={
        <DispatchHistory history={history} paper={dispatch.smacNumber ?? dispatch.quotationLabel} />
      }
      // What the load changed from its quotation, in words, for everybody who
      // can open it (SPEC §3, P13) — built on the server for the same reason.
      difference={
        <DispatchDifferences
          // Named as the facts above it name the paper: SMAC's number first (P12-11).
          label={dispatch.smacNumber ?? dispatch.quotationLabel}
          difference={dispatch.difference}
          items={dispatch.items}
          services={dispatch.services}
          serviceNames={dispatch.serviceNames}
        />
      }
      scope={{
        coordinator: user.role === "coordinator",
        // The rep whose COMPANY it is — not whoever raised it, and not a
        // manager, who sees everything and owns none of it (S8).
        owner: mayQuote(user, dispatch.companyRepId),
      }}
      // A report about this load, from the load (SPEC §3, P13), on the same
      // terms the popup's action accepts one.
      report={
        mayReportOn(user, dispatch.companyRepId, dispatch.shared) ? (
          <ReportButton
            companyId={dispatch.companyId}
            companyName={dispatch.companyName}
            projectId={dispatch.projectId ?? undefined}
            dispatchId={dispatch.id}
            variant="outline"
            icon
          >
            {t("common.addReport")}
          </ReportButton>
        ) : null
      }
    />
  );
}
