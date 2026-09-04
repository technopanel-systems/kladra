import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { QuotationDrawer } from "@/components/quotations/quotation-drawer";
import {
  QuotationSheetSkeleton,
  QuotationsTable,
} from "@/components/quotations/quotations-table";
import { requireUser } from "@/lib/authz";
import { listQuotations, type QuotationStatus } from "@/lib/quotations";

/**
 * Every quotation this person may see, newest first (SPEC S28–S36).
 *
 * No "Request quotation" button here, for the same reason there is no "Add
 * project" on the projects screen: a quotation is raised from inside a company
 * or a project (§3), and a dialog that opened by asking which company would be
 * a dropdown of every company in front of the list he was going to open anyway.
 * The empty state says where to go instead.
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

type Search = { q?: string; status?: string; open?: string };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (params.q ?? "").trim();
  const status = parseStatus(params.status);
  const open = params.open?.trim() || null;

  const [t, rows] = await Promise.all([
    getTranslations(),
    listQuotations({ user, q: q || undefined, status: status ?? undefined, locale }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.quotations")}</h1>

      <QuotationsTable base="/quotations" rows={rows} q={q} status={status} openId={open} />

      <Suspense key={open ?? "closed"} fallback={open ? <QuotationSheetSkeleton /> : null}>
        <QuotationDrawer quotationId={open} />
      </Suspense>
    </div>
  );
}
