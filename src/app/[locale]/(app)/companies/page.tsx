import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AddCompanyDialog } from "@/components/companies/add-company-dialog";
import { CompaniesTable } from "@/components/companies/companies-table";
import { CompanyDrawer } from "@/components/companies/company-drawer";
import { FollowUpStrip } from "@/components/companies/follow-up-strip";
import { ListSearch } from "@/components/companies/list-search";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can, requireUser } from "@/lib/authz";
import { listCompanies } from "@/lib/companies";
import { todayRiyadh } from "@/lib/dates";
import { followUpCounts, parseFollowUpFilter } from "@/lib/followups";

/**
 * The rep's home (SPEC §3): the follow-up strip first, because it is the
 * question a rep opens the day with, then a search that filters as he types,
 * then the list. Every row opens a drawer over this page.
 *
 * The three things that make a screen a screen live in the URL — `?q=`,
 * `?filter=` and `?open=` — so a refresh, a Back and a shared link all land on
 * exactly what was on screen (SPEC §3). Nothing here holds them in state.
 *
 * Narrowing happens in SQL, never over a fetched page: the strip's counts and
 * the rows under them come from the one follow-up definition in
 * `@/lib/followups`, which is what makes "2 overdue" and the two rows it opens
 * the same two (rules/data.md).
 *
 * `today` is computed once, on the server, in Riyadh, and handed down. A row
 * colour derived in the browser would be the visitor's day, and would flip at
 * hydration on a laptop set to another timezone.
 */

type Search = { q?: string; filter?: string; open?: string };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);

  const q = (params.q ?? "").trim();
  const filter = parseFollowUpFilter(params.filter);
  const open = params.open?.trim() || null;

  /**
   * Only a rep adds a company. The new row's `rep_id` is whoever pressed Save,
   * and there is no field for "whose company is this" — so a manager or admin
   * adding one would quietly become its rep. They read this screen instead
   * (WORKFLOW §3, Abdulrahman: no Add company button). The action refuses them
   * as well; this only keeps a button they cannot use off the screen.
   */
  const mayAdd = can(user, "rep");

  const [t, rows, counts] = await Promise.all([
    getTranslations(),
    listCompanies({ user, q: q || undefined, filter, locale }),
    followUpCounts(user),
  ]);

  // The table shows words, so it is given words: the picked city or the free
  // text, and the main contact already resolved by the query.
  const tableRows = rows.map((row) => ({
    id: row.id,
    name: row.name,
    city: row.cityName,
    contactName: row.mainContactName,
    contactPhone: row.mainContactPhone,
    lastActivityOn: row.lastActivityOn,
    nextFollowUp: row.nextFollowUp,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("common.companies")}</h1>
        {mayAdd ? <AddCompanyDialog /> : null}
      </div>

      <FollowUpStrip counts={counts} filter={filter ?? null} q={q} open={open} />

      <ListSearch q={q} filter={filter ?? null} open={open} />

      {tableRows.length === 0 ? (
        <EmptyList q={q} filtered={filter !== undefined} mayAdd={mayAdd} />
      ) : (
        <CompaniesTable
          rows={tableRows}
          q={q}
          filter={filter ?? null}
          openId={open}
          today={todayRiyadh()}
        />
      )}

      {/* Keyed by the company so switching rows renders a fresh drawer rather
          than animating one company's header into another's. */}
      <Suspense key={open ?? "closed"} fallback={null}>
        <CompanyDrawer companyId={open} />
      </Suspense>
    </div>
  );
}

/**
 * One sentence and its primary action, every time (SPEC §3). Which sentence
 * depends on WHY the list is empty: a search that matched nothing, a filter
 * that matched nothing, or a rep on his first day. Offering "Add company" to
 * someone whose search simply missed would be answering a question he did not
 * ask.
 */
async function EmptyList({
  q,
  filtered,
  mayAdd,
}: {
  q: string;
  filtered: boolean;
  mayAdd: boolean;
}) {
  const t = await getTranslations();

  if (q) {
    return (
      <Panel
        sentence={t("shell.searchNoResults", { q })}
        action={t("companies.clearSearch")}
        href="/companies"
      />
    );
  }
  if (filtered) {
    return (
      <Panel
        sentence={t("companies.emptyFilter")}
        action={t("companies.clearFilter")}
        href="/companies"
      />
    );
  }
  // A manager reading an empty floor is told it is empty; he is not handed a
  // button that would make the company his.
  return (
    <div className="card-face flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="max-w-prose text-sm text-muted-foreground">
        {mayAdd ? t("shell.emptyCompanies") : t("common.nothingYet")}
      </p>
      {mayAdd ? <AddCompanyDialog /> : null}
    </div>
  );
}

function Panel({ sentence, action, href }: { sentence: string; action: string; href: string }) {
  return (
    <div className="card-face flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="max-w-prose text-sm text-muted-foreground">{sentence}</p>
      <Button asChild variant="outline">
        <Link href={href}>{action}</Link>
      </Button>
    </div>
  );
}
