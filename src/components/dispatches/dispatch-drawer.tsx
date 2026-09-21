import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { dispatchBrand } from "@/components/dispatches/dispatch-brand";
import { DispatchDifferences } from "@/components/dispatches/dispatch-differences";
import { DispatchHistory } from "@/components/dispatches/dispatch-history";
import { DispatchTrouble } from "@/components/dispatches/dispatch-trouble";
import { CREDIT_SPLIT } from "@/lib/credit";
import { DispatchSheet } from "@/components/dispatches/dispatches-table";
import { ReportButton } from "@/components/reports/report-dialog";
import { mayReportOn } from "@/lib/activities";
import { NotAllowed, requireUser } from "@/lib/authz";
import { mayWrite } from "@/lib/floor";
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
 *
 * And a read that fails fails in the drawer's own panel, with Try again, not on
 * the screen under it (`DispatchTrouble`, P13-G6 S12.5): the boundary stands
 * outside the reads, so what it catches is theirs.
 */
export function DispatchDrawer({
  dispatchId,
  param = "open",
}: {
  dispatchId: string | null;
  /** The query parameter it was opened by — "dispatch" on the queue. */
  param?: string;
}) {
  if (!dispatchId) return null;
  return (
    <DispatchTrouble param={param}>
      <DispatchDrawerBody dispatchId={dispatchId} param={param} />
    </DispatchTrouble>
  );
}

async function DispatchDrawerBody({ dispatchId, param }: { dispatchId: string; param: string }) {
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

  const scope = {
    coordinator: user.role === "coordinator",
    /**
     * Whose load this is — the rep it was raised for, and nobody else: not a
     * manager, who sees everything and owns none of it (S8), and since P14.5
     * not the customer's rep either unless the load is also his.
     *
     * It read the COMPANY's rep, which was neither the action's question nor
     * SPEC §3's, and was wrong in both directions once a project could carry
     * two names: it offered Edit to the customer's rep on a load his colleague
     * had raised on their shared job, and withheld it from the colleague whose
     * load it actually was — a screen refusing work the write permits, the same
     * defect as offering work it refuses, one mirror over (§5 #163).
     */
    owner: mayWrite(user, dispatch.repId),
  };

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
        warehouseIds: dispatch.warehouses.map((store) => String(store.id)),
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
          // Its name, so a service the admin has since switched off still reads
          // as itself on the row that carries it (SPEC §3, P13).
          name: service.name,
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
          warehouseNames={dispatch.warehouseNames}
        />
      }
      scope={scope}
      // His own name on his own load is a word to read past (D116).
      mine={dispatch.repId === user.id}
      // A report about this load, from the load (SPEC §3, P13), on the same
      // terms the popup's action accepts one: not on an archived customer, and
      // not on a job that is lost or archived, which the popup would open on
      // and the action refuse (D176).
      report={
        !dispatch.companyArchived &&
        !dispatch.projectArchived &&
        !dispatch.projectLostOn &&
        mayReportOn(user, dispatch.companyRepId, dispatch.shared) ? (
          <ReportButton
            companyId={dispatch.companyId}
            companyName={dispatch.companyName}
            projectId={dispatch.projectId ?? undefined}
            dispatchId={dispatch.id}
            // The brand when nothing else on the row is the work: Approve is
            // hers, and a refused load's corrected request is his (P13-G6).
            variant={dispatchBrand(dispatch.status, scope) === "report" ? "brand" : "outline"}
            icon
          >
            {t("common.addReport")}
          </ReportButton>
        ) : null
      }
    />
  );
}
