import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DispatchDrawer } from "@/components/dispatches/dispatch-drawer";
import { DispatchSheetSkeleton, DispatchesTable } from "@/components/dispatches/dispatches-table";
import { RequestDispatchDialog } from "@/components/dispatches/request-dispatch-dialog";
import { Button } from "@/components/ui/button";
import { ListTail } from "@/components/ui-ext/list-tail";
import { NarrowingNote } from "@/components/metrics/narrowing-note";
import { parseNarrowing } from "@/lib/narrowing";
import { requireUser } from "@/lib/authz";
import {
  countDispatches,
  directDispatchCompanies,
  listDispatches,
  type DispatchStatus,
} from "@/lib/dispatches";
import { LIST_LIMIT } from "@/lib/list-size";
import { dispatchTargets } from "@/lib/pickers";
import { raisesOnBehalf } from "@/lib/on-behalf";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { viewFor } from "@/lib/view";

/**
 * Dispatches — what has actually gone out, and what is waiting to (SPEC S37).
 *
 * The rep's own, the coordinator's all of them.
 *
 * The primary action raises one: from an issued quotation on the live revision
 * with something still left to send, or direct, for a customer of his own with
 * no paper at all (SPEC §3, P13). So the button is there exactly when the form
 * behind it has something to choose: a paper he may send against, or a customer
 * he may load a truck for with none — a rep whose customers have no quotation yet
 * is exactly the one a direct load is for. The manager, who sells and owns no
 * customer, and a reader who is only viewing, have neither and see no button.
 */

/** The list's own four, and a door's narrowing (src/lib/narrowing.ts), which may repeat a key. */
type Search = { q?: string; status?: string; open?: string; view?: string } & Record<
  string,
  string | string[] | undefined
>;

function parseStatus(value: string | undefined): DispatchStatus | null {
  return value === "submitted" || value === "approved" || value === "refused" ? value : null;
}

export default async function DispatchesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (typeof params.q === "string" ? params.q : "").trim();
  const status = parseStatus(params.status);
  const open = params.open?.trim() || null;
  // His own choice, not this browser's, and remembered apart from the
  // quotations list: the two screens are read for different questions.
  const stored = chosen(await rememberedChoices(user.id), "view", "dispatches");
  const view = viewFor(params.view, stored);

  // Opened from a figure on the metrics tab (SPEC §3 P13): the loads that
  // figure counted, and a line over the list that says so.
  const moved = parseNarrowing(params) ?? undefined;

  const narrowing = {
    user,
    q: q || undefined,
    status: view === "board" ? undefined : (status ?? undefined),
    locale,
    moved,
  };

  const [t, rows, targets, direct] = await Promise.all([
    getTranslations(),
    listDispatches({ ...narrowing, limit: LIST_LIMIT }),
    dispatchTargets(user),
    // The customers the dialog would offer Direct for, asked of the reader the
    // dialog itself asks (P13 review): "sells and may write" was true of the
    // manager, who owns no customer, and the button opened a form with nothing
    // in it to choose.
    directDispatchCompanies(user),
  ]);

  // Only when it came back full (D80).
  const total = rows.length === LIST_LIMIT ? await countDispatches(narrowing) : rows.length;
  // A status chip that hides every row says how many it hides (DESIGN §8), so
  // "nothing is waiting" over a floor of forty loads does not read as a floor
  // of none. Counted only then, by the list's own predicate without the chip.
  const hidden =
    rows.length === 0 && narrowing.status && !q
      ? await countDispatches({ ...narrowing, status: undefined })
      : 0;
  const forOthers = raisesOnBehalf(user);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.dispatches")}</h1>
        {/* Hers whenever there is anybody to raise one for (SPEC §3 P13). */}
        {targets.quotations.length > 0 || direct.length > 0 || forOthers ? (
          <RequestDispatchDialog
            targets={targets}
            raisesForOthers={forOthers}
            trigger={
              <Button variant="brand">
                {t("dispatches.request")}
              </Button>
            }
          />
        ) : null}
      </div>

      {moved ? <NarrowingNote narrowing={moved} list="dispatches" /> : null}

      <DispatchesTable
        base="/dispatches"
        rows={rows}
        q={q}
        status={status}
        openId={open}
        view={view}
        remembered={stored}
        hidden={hidden}
      />

      <ListTail shown={rows.length} total={total} />

      <Suspense key={open ?? "closed"} fallback={open ? <DispatchSheetSkeleton /> : null}>
        <DispatchDrawer dispatchId={open} />
      </Suspense>
    </div>
  );
}
