import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AddCompanyDialog } from "@/components/companies/add-company-dialog";
import { CompaniesTable } from "@/components/companies/companies-table";
import { CompanyDrawer } from "@/components/companies/company-drawer";
import { FollowUpStrip } from "@/components/companies/follow-up-strip";
import { LeadsBand } from "@/components/leads/leads-band";
import { Empty } from "@/components/ui-ext/empty";
import { ListSearch } from "@/components/ui-ext/list-search";
import { ListTail } from "@/components/ui-ext/list-tail";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { MonthCard } from "@/components/team/month-card";
import { PersonStrip } from "@/components/team/person-strip";
import { requireUser, seesAll } from "@/lib/authz";
import { addsCompanies, filesLeads, mayWrite, ownsCompanies, sells } from "@/lib/floor";
import { countCompanies, listCompanies } from "@/lib/companies";
import { LIST_LIMIT } from "@/lib/list-size";
import {
  followUpCounts,
  followUpCountsForRep,
  parseFollowUpFilter,
  type FollowUpFilter,
} from "@/lib/followups";
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
 * the same two (rules/data.md). The row's colour is that definition too — the
 * list hands the table each row's follow-up state rather than a `today` for
 * the browser to compare against.
 *
 * Two rhythms (DESIGN §1b): 24 between the cards of the page — the month, the
 * standing, the list — and 16 inside the list, between the chips, the search
 * and the rows they narrow, which belong together.
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
   *
   * And not marketing since P12-7. SPEC §3: "Marketing does not use the Add
   * company form. Marketing has its own module for bringing in a lead." It
   * still HOLDS companies — a lead filed onto its own floor is one — so this
   * screen is still its floor and still its search; what has gone is the way
   * in, which is now New lead and asks the two questions a lead has.
   *
   * And the sentence the action asks besides the role (`mayWrite`): an admin
   * viewing as a rep is reading his screen, and `requireActor` refuses every
   * write while he does (P8.8, DESIGN §5).
   */
  const mayAdd = addsCompanies(user.role) && mayWrite(user, user.id);

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
   * An empty list under a chip is a list the chip emptied — or a floor with
   * nothing on it. Only the first has companies to hide, and a sentence that
   * says "nothing matches" over twelve customers a click away is the dead end
   * the four kinds of empty exist to avoid (DESIGN §8). So the same narrowing,
   * without the chip, counted in SQL: how many that chip is holding back.
   */
  const hidden =
    rows.length === 0 && filter ? await countCompanies({ ...narrowing, filter: undefined }) : 0;
  const firstUse = rows.length === 0 && !q && !filter;

  /*
   * Whose floor this is, and whether that person quotes. Everybody who owns
   * companies sells since SPEC §3 P13 made marketing a rep (D168); the question
   * is still asked, because a floor whose holder raises nothing would show two
   * of the strip's three figures as nought for ever (D44).
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
    followUpState: row.followUpState,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {viewedName ? t("team.companiesOf", { name: viewedName }) : t("common.companies")}
        </h1>
        {mayAdd ? <AddCompanyDialog /> : null}
        {/* The way back sits where the title's action would: a manager reading
            one rep's floor adds nothing here, and came from the team. */}
        {viewedName ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/team">{t("team.backToTeam")}</Link>
          </Button>
        ) : null}
      </div>

      {/* The leads given to him and not yet acknowledged, apart from his own
          companies and above them (SPEC §3 P13) — reads its own rows. */}
      <LeadsBand rep={repId} />

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

      <div data-slot="company-list" className="flex flex-col gap-4">
        {/* A floor with nothing on it has nothing to narrow: no chips saying
            "nothing is due" and no box to search it, only the one sentence. */}
        {firstUse ? null : (
          <>
            <FollowUpStrip counts={counts} filter={filter ?? null} q={q} open={open} rep={repId} />
            <ListSearch
              q={q}
              keep={{ filter: filter ?? null, open, rep: repId }}
              label={t("companies.searchLabel")}
              placeholder={t("companies.searchPlaceholder")}
              clearLabel={t("companies.clearSearch")}
            />
          </>
        )}

        {tableRows.length === 0 ? (
          <EmptyList
            q={q}
            filter={filter ?? null}
            hidden={hidden}
            first={
              mayAdd
                ? t("shell.emptyCompanies")
                : viewedName
                  ? t("companies.emptyFloor", { name: viewedName })
                  : filesLeads(user.role)
                    ? t("companies.emptyLeads")
                    : t("common.nothingYet")
            }
            rep={repId}
          />
        ) : (
          <CompaniesTable
            rows={tableRows}
            q={q}
            filter={filter ?? null}
            openId={open}
            rep={repId}
          />
        )}

        <ListTail shown={rows.length} total={total} />
      </div>

      {/* Keyed by the company so switching rows renders a fresh drawer rather
          than animating one company's header into another's. */}
      <Suspense key={open ?? "closed"} fallback={null}>
        <CompanyDrawer companyId={open} />
      </Suspense>
    </div>
  );
}

/**
 * Nothing in the list, and which of the four nothings it is (DESIGN §8, D127).
 *
 * - **Filtered out**: a chip is holding companies back. It says how many, and
 *   the way out keeps the search and drops the chip.
 * - **No results**: the search matched nothing at all. The way out clears the
 *   search and keeps the chip.
 * - **First use**: the floor is empty. One sentence, because where the work
 *   starts is already on the screen — Add company in the title row, whose
 *   second copy here would be a second brand button (D31, D35) — or, for a
 *   reader who adds nothing here, whose floor it is.
 * - **Could not load** is not an empty list: the query threw, and the screen's
 *   own card says so (`error.tsx`).
 */
async function EmptyList({
  q,
  filter,
  hidden,
  first,
  rep,
}: {
  q: string;
  filter: FollowUpFilter | null;
  /** How many companies the chip is holding back, counted without it. */
  hidden: number;
  /** The first-use sentence, already chosen for this reader. */
  first: string;
  /** Whose floor a manager is reading (S8); the way back keeps him on it (P11G). */
  rep: string | null;
}) {
  const t = await getTranslations();

  // Built the way the strip, the search and the table build theirs.
  function href(keep: { q?: string; filter?: FollowUpFilter | null }): string {
    const params = new URLSearchParams();
    if (keep.q) params.set("q", keep.q);
    if (keep.filter) params.set("filter", keep.filter);
    if (rep) params.set("rep", rep);
    const query = params.toString();
    return query ? `/companies?${query}` : "/companies";
  }

  if (filter && hidden > 0) {
    return (
      <Empty
        action={
          <Button asChild variant="outline">
            <Link href={href({ q })}>{t("companies.clearFilter")}</Link>
          </Button>
        }
      >
        {t("companies.filteredOut", { count: hidden })}
      </Empty>
    );
  }
  if (q) {
    return (
      <Empty
        action={
          <Button asChild variant="outline">
            <Link href={href({ filter })}>{t("companies.clearSearch")}</Link>
          </Button>
        }
      >
        {t("shell.searchNoResults", { q })}
      </Empty>
    );
  }
  return <Empty>{first}</Empty>;
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
