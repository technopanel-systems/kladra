import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { QuotationDrawer } from "@/components/quotations/quotation-drawer";
import {
  QuotationSheetSkeleton,
  QuotationsTable,
} from "@/components/quotations/quotations-table";
import { requireUser } from "@/lib/authz";
import { listQuotations } from "@/lib/quotations";

/**
 * The coordinator's queue: the requests waiting on her, and nothing else
 * (SPEC S9, S28).
 *
 * One status by definition, so there are no filter chips — a chip that only
 * ever has one setting is a control that does nothing. A request she has issued
 * or sent back has left her desk; it is on the rep's list, which is where the
 * next move is.
 *
 * Her home is this screen (`homeFor` in src/lib/authz.ts), so it is the first
 * thing she sees: what is waiting, not a record to look something up in.
 */

type Search = { q?: string; open?: string };

export default async function QueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (params.q ?? "").trim();
  const open = params.open?.trim() || null;

  const [t, rows] = await Promise.all([
    getTranslations(),
    listQuotations({ user, q: q || undefined, status: "requested", locale }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.queue")}</h1>

      <QuotationsTable
        base="/queue"
        rows={rows}
        q={q}
        status="requested"
        openId={open}
        showFilters={false}
      />

      <Suspense key={open ?? "closed"} fallback={open ? <QuotationSheetSkeleton /> : null}>
        <QuotationDrawer quotationId={open} />
      </Suspense>
    </div>
  );
}
