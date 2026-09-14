import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { QuotationDrawer } from "@/components/quotations/quotation-drawer";
import { ListTail } from "@/components/ui-ext/list-tail";
import { NarrowingNote } from "@/components/metrics/narrowing-note";
import { parseNarrowing } from "@/lib/narrowing";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import {
  QuotationSheetSkeleton,
  QuotationsTable,
} from "@/components/quotations/quotations-table";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/authz";
import { issuesOwnQuotations } from "@/lib/floor";
import { raisesOnBehalf } from "@/lib/on-behalf";
import { quotationTargets } from "@/lib/pickers";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { viewFor } from "@/lib/view";
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

/** The list's own four, and a door's narrowing (src/lib/narrowing.ts), which may repeat a key. */
type Search = { q?: string; status?: string; open?: string; view?: string } & Record<
  string,
  string | string[] | undefined
>;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (typeof params.q === "string" ? params.q : "").trim();
  const status = parseStatus(params.status);
  const open = params.open?.trim() || null;
  // The URL wins, the person remembers, the list is the default (src/lib/view.ts).
  // `stored` goes back down to the switch so it writes only when he changes it.
  const stored = chosen(await rememberedChoices(user.id), "view", "quotations");
  const view = viewFor(params.view, stored);

  // A board of states shows every state: narrowing to one would leave one
  // column standing, which is why the chips are hidden in that view too.
  // Opened from a figure on the metrics tab (SPEC §3 P13): the cohort that
  // figure counted, and a line over the list that says so.
  const cohort = parseNarrowing(params) ?? undefined;

  const narrowing = {
    user,
    q: q || undefined,
    status: view === "board" ? undefined : (status ?? undefined),
    locale,
    cohort,
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
        {/* Hers whenever there is anybody to raise one for, even with no job of
            her own: the dialog's "For" field says whose (SPEC §3 P13). */}
        {targets.projects.length > 0 || raisesOnBehalf(user) ? (
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

      {cohort ? <NarrowingNote narrowing={cohort} list="quotations" /> : null}

      <QuotationsTable
        base="/quotations"
        rows={rows}
        q={q}
        status={status}
        openId={open}
        view={view}
        remembered={stored}
      />

      <ListTail shown={rows.length} total={total} />

      <Suspense key={open ?? "closed"} fallback={open ? <QuotationSheetSkeleton /> : null}>
        <QuotationDrawer quotationId={open} />
      </Suspense>
    </div>
  );
}
