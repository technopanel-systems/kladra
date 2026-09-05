import { getLocale } from "next-intl/server";
import { z } from "zod";
import { DispatchSheet } from "@/components/dispatches/dispatches-table";
import { NotAllowed, requireUser } from "@/lib/authz";
import { mayQuote } from "@/lib/floor";
import { getDispatch } from "@/lib/dispatches";

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

  const [user, locale] = await Promise.all([requireUser(), getLocale()]);

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

  return (
    <DispatchSheet
      param={param}
      dispatch={dispatch}
      items={dispatch.items}
      // What Edit opens on: the quantities as they are, by quotation line id.
      draft={{
        dispatchId: dispatch.id,
        shipmentMethodId: String(dispatch.shipmentMethodId),
        destination: dispatch.destination,
        paymentTerms: dispatch.paymentTerms,
        sending: dispatch.items.map((item) => ({
          quotationItemId: item.quotationItemId,
          qty: item.qty,
        })),
      }}
      scope={{
        coordinator: user.role === "coordinator",
        // The rep whose COMPANY it is — not whoever raised it, and not a
        // manager, who sees everything and owns none of it (S8).
        owner: mayQuote(user, dispatch.companyRepId),
      }}
    />
  );
}
