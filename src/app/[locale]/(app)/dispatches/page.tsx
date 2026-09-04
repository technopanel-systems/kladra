import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DispatchDrawer } from "@/components/dispatches/dispatch-drawer";
import { DispatchSheetSkeleton, DispatchesTable } from "@/components/dispatches/dispatches-table";
import { requireUser } from "@/lib/authz";
import { listDispatches, type DispatchStatus } from "@/lib/dispatches";

/**
 * Dispatches — what has actually gone out, and what is waiting to (SPEC S37).
 *
 * The rep's own, the coordinator's all of them. There is no "Request dispatch"
 * button here on purpose: a dispatch is raised against a specific quotation
 * (S38), so it is raised from that quotation's drawer, and the empty state
 * sends him there rather than opening a dropdown of every issued quotation he
 * has.
 */

type Search = { q?: string; status?: string; open?: string };

function parseStatus(value: string | undefined): DispatchStatus | null {
  return value === "submitted" || value === "approved" || value === "refused" ? value : null;
}

export default async function DispatchesPage({
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
    listDispatches({ user, q: q || undefined, status: status ?? undefined, locale }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.dispatches")}</h1>

      <DispatchesTable base="/dispatches" rows={rows} q={q} status={status} openId={open} />

      <Suspense key={open ?? "closed"} fallback={open ? <DispatchSheetSkeleton /> : null}>
        <DispatchDrawer dispatchId={open} />
      </Suspense>
    </div>
  );
}
