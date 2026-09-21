import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { QuotationDrawer } from "@/components/quotations/quotation-drawer";
import { ExportButton } from "@/components/ui-ext/export-button";
import { ListTail } from "@/components/ui-ext/list-tail";
import { NarrowingNote } from "@/components/metrics/narrowing-note";
import { parseNarrowing } from "@/lib/narrowing";
import { QuotationFlash } from "@/components/quotations/quotation-flash";
import { QuotationSheetSkeleton } from "@/components/quotations/quotation-sheet";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import { QuotationsTable } from "@/components/quotations/quotations-table";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/authz";
import { issuesOwnQuotations } from "@/lib/floor";
import { raisesOnBehalf } from "@/lib/on-behalf";
import { quotationTargets } from "@/lib/pickers";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { viewFor } from "@/lib/view";
import { countQuotations, listQuotations, parseQuotationStatus } from "@/lib/quotations";
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
  const status = parseQuotationStatus(params.status) ?? null;
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

  // A chip that hides every row says how many it hides (DESIGN §8, filtered
  // out): asked only then, of the same narrowing without the chip. The search
  // stays in the count because the way out keeps it — "Nothing matched" under a
  // search that matched two and a chip that hid both was false. Not behind a
  // figure: the chips leave its cohort, so a count taken inside it would not be
  // the rows the way out shows.
  const hidden =
    view === "list" && status && !cohort && rows.length === 0
      ? await countQuotations({ ...narrowing, status: undefined })
      : 0;

  // Hers whenever there is anybody to raise one for, even with no job of her
  // own: the dialog's "For" field says whose (SPEC §3 P13).
  const canRequest = targets.projects.length > 0 || raisesOnBehalf(user);

  // Nothing here at all — no search, no chip, no cohort — is nothing to export
  // (P14 14.10), the same sentence the search box and the chips are hidden by.
  const firstUse = rows.length === 0 && !q && !status && !cohort;

  return (
    // The row the reader's own act changed flashes, across the drawer and the
    // list behind it (QuotationFlash, DESIGN §8).
    <QuotationFlash>
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.quotations")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* The file IS this list, narrowed the way it is narrowed at the
              moment it is asked for (P14 14.10). */}
          {firstUse ? null : (
            <ExportButton files={[{ name: "quotations", title: t("common.quotations") }]} />
          )}
          {canRequest ? (
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
        hidden={hidden}
        canRequest={canRequest}
      />

      <ListTail shown={rows.length} total={total} />

      <Suspense key={open ?? "closed"} fallback={open ? <QuotationSheetSkeleton /> : null}>
        <QuotationDrawer quotationId={open} />
      </Suspense>
    </div>
    </QuotationFlash>
  );
}
