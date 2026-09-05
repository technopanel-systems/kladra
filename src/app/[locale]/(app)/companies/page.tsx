import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AddCompanyDialog } from "@/components/companies/add-company-dialog";
import { CompaniesTable } from "@/components/companies/companies-table";
import { CompanyDrawer } from "@/components/companies/company-drawer";
import { FollowUpStrip } from "@/components/companies/follow-up-strip";
import { ListSearch } from "@/components/companies/list-search";
import { ListTail } from "@/components/ui-ext/list-tail";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { MonthCard } from "@/components/team/month-card";
import { PersonStrip } from "@/components/team/person-strip";
import { requireUser, seesAll } from "@/lib/authz";
import { ownsCompanies, sells } from "@/lib/floor";
import { countCompanies, listCompanies } from "@/lib/companies";
import { LIST_LIMIT } from "@/lib/list-size";
import { todayRiyadh } from "@/lib/dates";
import { followUpCounts, followUpCountsForRep, parseFollowUpFilter } from "@/lib/followups";
import { personStanding } from "@/lib/standing";
import { repMonth } from "@/lib/team";
import { db } from "@/db";
import { personName } from "@/lib/people";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "@/lib/types";

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

type Search = { q?: string; filter?: string; open?: string; rep?: string };

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
   * Whose floor this is. A manager drills in from the team table (S8); a rep
   * asking for somebody else's id gets his own list either way, because
   * `listCompanies` still scopes him underneath.
   */
  const repId = seesAll(user) ? (params.rep?.trim() || null) : null;
  const viewing = repId ?? (ownsCompanies(user.role) ? user.id : null);

  /**
   * Only a rep adds a company. The new row's `rep_id` is whoever pressed Save,
   * and there is no field for "whose company is this" — so a manager or admin
   * adding one would quietly become its rep. They read this screen instead
   * (WORKFLOW §3, Abdulrahman: no Add company button). The action refuses them
   * as well; this only keeps a button they cannot use off the screen.
   */
  const mayAdd = ownsCompanies(user.role);

  const narrowing = { user, q: q || undefined, filter, repId: repId ?? undefined, locale };

  const [t, rows, counts, viewed, month] = await Promise.all([
    getTranslations(),
    listCompanies({ ...narrowing, limit: LIST_LIMIT }),
    // The strip counts what the list shows: drilling into one rep's floor and
    // reading the whole team's overdue count above it would be two answers to
    // one question (rules/data.md).
    repId ? followUpCountsForRep(repId) : followUpCounts(user),
    repId ? viewedPerson(repId) : Promise.resolve(null),
    // The month card, for whoever's floor this is. A manager reading his own
    // screen has no personal target and no card (§3); he has the team screen.
    viewing ? repMonth(viewing) : Promise.resolve(null),
  ]);

  const viewedName = viewed?.name ?? null;

  /*
   * How many there are, asked only when the list came back full (D80). A floor
   * of two thousand used to be two thousand rows in the HTML, twice over — the
   * phone's cards and the desk's table are both rendered and one is hidden by
   * CSS — and the screen said nothing about it. The seeded floor is twelve, so
   * nothing here has ever been seen at the size it will be used at.
   */
  const total = rows.length === LIST_LIMIT ? await countCompanies(narrowing) : rows.length;

  /*
   * Whose floor this is, and whether that person quotes. Marketing owns
   * companies and raises nothing, so two of the strip's three figures would be
   * nought on every screen for ever — the same sentence that takes the month
   * card off its day (D44). Its follow-up strip below is its own standing.
   */
  const viewedRole: Role | null = repId ? (viewed?.role ?? null) : user.role;
  const standing =
    viewing && viewedRole && sells(viewedRole) ? await personStanding(viewing) : null;

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
        <h1 className="text-xl font-semibold">
          {viewedName ? t("team.companiesOf", { name: viewedName }) : t("common.companies")}
        </h1>
        {mayAdd ? <AddCompanyDialog /> : null}
      </div>

      {viewedName ? (
        <div className="flex">
          <Button asChild variant="outline" size="sm">
            <Link href="/team">{t("team.backToTeam")}</Link>
          </Button>
        </div>
      ) : null}

      {month ? (
        /* A manager who drills into a rep's floor used to get the rep's bare
           NAME over Achieved / Target / Pace, with no month anywhere on the
           card — three figures whose whole meaning is the month they are in
           (D59). His own card says "My month"; this one says whose and when. */
        <MonthCard
          title={viewedName ? t("team.monthOf", { name: viewedName }) : t("team.myMonth")}
          target={month.target}
          achieved={month.achieved}
          pace={month.pace}
        />
      ) : null}

      {/* How this floor is standing, between the month above it and the calls
          due below it (D78). The month says what has moved; this says what is
          still in play and what has stopped on the way. */}
      {standing ? <PersonStrip standing={standing} /> : null}

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

      <ListTail shown={rows.length} total={total} />

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

/**
 * Who is behind `?rep=` — a heading says who, never an id (DESIGN §2).
 *
 * The role comes back with the name because the standing strip depends on it,
 * and a second query for one column of the row already fetched is how a screen
 * gets slow one line at a time.
 */
async function viewedPerson(repId: string): Promise<{ name: string; role: Role } | null> {
  const [row] = await db
    .select({ name: personName(await getLocale()), role: users.role })
    .from(users)
    .where(eq(users.id, repId))
    .limit(1);
  return row ? { name: row.name, role: row.role as Role } : null;
}
