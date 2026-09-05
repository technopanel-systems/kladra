import { cookies } from "next/headers";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DispatchDrawer } from "@/components/dispatches/dispatch-drawer";
import { DispatchSheetSkeleton, DispatchesTable } from "@/components/dispatches/dispatches-table";
import { RequestDispatchDialog } from "@/components/dispatches/request-dispatch-dialog";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/authz";
import { listDispatches, type DispatchStatus } from "@/lib/dispatches";
import { dispatchableQuotationOptions } from "@/lib/pickers";
import { viewCookie, viewFor } from "@/lib/view";

/**
 * Dispatches — what has actually gone out, and what is waiting to (SPEC S37).
 *
 * The rep's own, the coordinator's all of them.
 *
 * The primary action raises one, and asks which quotation first (SPEC §3, P8).
 * The list it offers is issued quotations on the live revision with something
 * still left to send, so a rep cannot pick one and find every line at zero.
 * Nobody who has none is shown the button.
 */

type Search = { q?: string; status?: string; open?: string; view?: string };

function parseStatus(value: string | undefined): DispatchStatus | null {
  return value === "submitted" || value === "approved" || value === "refused" ? value : null;
}

export default async function DispatchesPage({
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
  const view = viewFor(params.view, jar.get(viewCookie("dispatches"))?.value);

  const [t, rows, quotations] = await Promise.all([
    getTranslations(),
    listDispatches({
      user,
      q: q || undefined,
      status: view === "board" ? undefined : (status ?? undefined),
      locale,
    }),
    dispatchableQuotationOptions(user),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.dispatches")}</h1>
        {quotations.length > 0 ? (
          <RequestDispatchDialog
            quotations={quotations}
            trigger={
              <Button className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
                {t("dispatches.request")}
              </Button>
            }
          />
        ) : null}
      </div>

      <DispatchesTable
        base="/dispatches"
        rows={rows}
        q={q}
        status={status}
        openId={open}
        view={view}
      />

      <Suspense key={open ?? "closed"} fallback={open ? <DispatchSheetSkeleton /> : null}>
        <DispatchDrawer dispatchId={open} />
      </Suspense>
    </div>
  );
}
