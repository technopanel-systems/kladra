import { cookies } from "next/headers";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { QuotationDrawer } from "@/components/quotations/quotation-drawer";
import { ListTail } from "@/components/ui-ext/list-tail";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import {
  QuotationSheetSkeleton,
  QuotationsTable,
} from "@/components/quotations/quotations-table";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/authz";
import { issuesOwnQuotations } from "@/lib/floor";
import { quotationTargets } from "@/lib/pickers";
import { viewCookie, viewFor } from "@/lib/view";
import { countQuotations, listQuotations, type QuotationStatus } from "@/lib/quotations";
import { LIST_LIMIT } from "@/lib/list-size";

/**
 * Every quotation this person may see, newest first (SPEC S28–S36).
 *
 * The primary action requests one, and asks the chain a rep has the answers in:
 * which customer, then which of that customer's jobs, then who at the customer
 * it is for (SPEC §3, P8, P12-9). It asked for the job first, out of one flat
 * list of every job in the building.
 * The coordinator sees every quotation on this screen and raises none, so she
 * is offered no button: she owns no companies, so the list of projects a
 * request could go on is empty and the control is never drawn.
 *
 * Only the latest revision of a number is listed. Earlier ones stay readable
 * from the drawer, because a project quoted three times at 2,000 m² is 2,000,
 * not 6,000 (S35).
 */

const STATUSES: QuotationStatus[] = [
  "requested",
  "returned",
  "issued",
  "accepted",
  "rejected",
  "cancelled",
];

function parseStatus(value: string | undefined): QuotationStatus | null {
  const wanted = STATUSES.find((status) => status === value);
  return wanted ?? null;
}

type Search = { q?: string; status?: string; open?: string; view?: string };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, locale, params, jar] = await Promise.all([
    requireUser(),
    getLocale(),
    searchParams,
    cookies(),
  ]);

  const q = (params.q ?? "").trim();
  const status = parseStatus(params.status);
  const open = params.open?.trim() || null;
  // The URL wins, the cookie remembers, the list is the default (src/lib/view.ts).
  const view = viewFor(params.view, jar.get(viewCookie("quotations"))?.value);

  // A board of states shows every state: narrowing to one would leave one
  // column standing, which is why the chips are hidden in that view too.
  const narrowing = {
    user,
    q: q || undefined,
    status: view === "board" ? undefined : (status ?? undefined),
    locale,
  };

  const [t, rows, targets] = await Promise.all([
    getTranslations(),
    listQuotations({ ...narrowing, limit: LIST_LIMIT }),
    quotationTargets(user),
  ]);

  // She does not ask the desk for a price; she IS the desk (SPEC §3), so the
  // same door says Issue and the form behind it asks for the SMAC number.
  const direct = issuesOwnQuotations(user.role);

  // Only when it came back full (D80). This list is years long on a real floor.
  const total = rows.length === LIST_LIMIT ? await countQuotations(narrowing) : rows.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.quotations")}</h1>
        {targets.projects.length > 0 ? (
          <RequestQuotationDialog
            targets={targets}
            issuesDirectly={direct}
            trigger={
              <Button variant="brand">
                {t(direct ? "quotations.issueOwn" : "quotations.request")}
              </Button>
            }
          />
        ) : null}
      </div>

      <QuotationsTable
        base="/quotations"
        rows={rows}
        q={q}
        status={status}
        openId={open}
        view={view}
      />

      <ListTail shown={rows.length} total={total} />

      <Suspense key={open ?? "closed"} fallback={open ? <QuotationSheetSkeleton /> : null}>
        <QuotationDrawer quotationId={open} />
      </Suspense>
    </div>
  );
}
