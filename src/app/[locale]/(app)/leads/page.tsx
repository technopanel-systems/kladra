import { getLocale, getTranslations } from "next-intl/server";
import { LeadFilters } from "@/components/leads/lead-filters";
import { parseLeadQuery } from "@/components/leads/lead-view";
import { LeadsTable, type LeadRow } from "@/components/leads/leads-table";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";
import { Empty } from "@/components/ui-ext/empty";
import { ListTail } from "@/components/ui-ext/list-tail";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { listNonWorkingDays } from "@/lib/calendar";
import { firstOfMonth, todayRiyadh } from "@/lib/dates";
import { filesLeads, mayHandOver, mayWrite, seesAllRoles } from "@/lib/floor";
import { ageLeads, countLeads, listLeads } from "@/lib/leads";
import { LIST_LIMIT } from "@/lib/list-size";
import { floorHolderOptions } from "@/lib/pickers";

/**
 * Leads — marketing's module, and the manager's desk for it (SPEC §3, P12-7, P13).
 *
 * Marketing files here and watches "what became of each lead it passed:
 * acknowledged, contacted, quoted, won" — the last column, read from each
 * company's own records. The manager reads every lead, sees the ones nobody has
 * picked up in two working days in red at the top (the same rows his stuck list
 * names), and assigns and reassigns from the row. The admin reads what the
 * manager reads. A rep has no leads screen: one given to him is in the band
 * above his companies and on his day, and a rep who follows a link here goes to
 * his own home rather than to an error page (S8).
 *
 * Narrowed by who the lead is with and whether it has been acknowledged, both in
 * the address and both applied in SQL before the cap (rules/data.md, D145).
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, locale, raw] = await Promise.all([requireUser(), getLocale(), searchParams]);
  const readsOwn = filesLeads(user.role);
  const readsAll = seesAllRoles(user.role);
  if (!readsOwn && !readsAll) redirect({ href: homeFor(user.role), locale });
  // Filing is a write, so it asks what the action asks besides the role: an
  // admin viewing as marketing reads marketing's leads and files none (P8.8,
  // `requireActor`), and is not offered a New lead the server would refuse.
  const mayFile = readsOwn && mayWrite(user, user.id);

  const query = parseLeadQuery(raw);
  const filtered = query.with !== null || query.state !== null;
  const mayMove = mayHandOver(user);
  const today = todayRiyadh();
  const t = await getTranslations();

  const [leads, holders] = await Promise.all([
    listLeads(user, query, LIST_LIMIT),
    // One read of everybody a company can sit with, for three controls: who a
    // new lead goes to, who the list is narrowed to, and who a lead is moved to.
    floorHolderOptions(null, (role) => t(`common.${role}`)),
  ]);

  /*
   * How many there are in all, asked only when the list came back full (D80).
   *
   * And the holidays every wait on this screen crosses, back to the oldest lead
   * on it — the same read the manager's stuck list makes, for the same reason:
   * a lead filed on the 28th must not age a holiday on the 30th as a working
   * day (D97, D141).
   */
  const total = leads.length === LIST_LIMIT ? await countLeads(user, query) : leads.length;
  const earliest = leads.reduce(
    (soonest, lead) => (lead.givenOn < soonest ? lead.givenOn : soonest),
    firstOfMonth(today),
  );
  const nonWorking = await listNonWorkingDays(earliest, today);

  const rows: LeadRow[] = ageLeads(leads, today, nonWorking).map((lead) => ({
    id: lead.id,
    name: lead.name,
    query: lead.query,
    fromId: lead.fromId,
    fromName: lead.fromName,
    repId: lead.repId,
    repName: lead.repName,
    givenOn: lead.givenOn,
    acknowledgedOn: lead.acknowledgedOn,
    stage: lead.stage,
    waited: lead.waited,
    city: lead.city,
  }));

  // Filing: "assigned to a rep or to herself in the same step" (§3 P13), so the
  // person filing is the first answer on the picker and everybody else follows.
  const targets = mayFile
    ? [
        ...holders.filter((person) => person.value === user.id),
        ...holders.filter((person) => person.value !== user.id),
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("leads.title")}</h1>
        {mayFile ? <NewLeadDialog targets={targets} /> : null}
      </div>

      <LeadFilters query={query} people={holders} />

      {rows.length === 0 ? (
        filtered ? (
          <Empty
            action={
              <Button asChild variant="outline">
                <Link href="/leads">{t("leads.clearFilters")}</Link>
              </Button>
            }
          >
            {t("leads.emptyFilter")}
          </Empty>
        ) : (
          /* The sentence alone: New lead is already in the heading row above,
             and an empty list that repeats its own primary action puts two brand
             gradients on one screen (DESIGN §2, D31, D35). */
          <Empty>{readsOwn ? t("leads.empty") : t("common.nothingYet")}</Empty>
        )
      ) : (
        // Who found it is only worth a column on a screen that reads more than
        // one person's: marketing's own list would say its own name on every
        // row (D46 — a figure nobody can read two ways).
        <LeadsTable
          rows={rows}
          showFinder={readsAll}
          opens={readsAll}
          people={mayMove ? holders : null}
        />
      )}

      <ListTail shown={rows.length} total={total} />
    </div>
  );
}
