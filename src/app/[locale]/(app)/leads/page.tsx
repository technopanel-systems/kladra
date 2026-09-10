import { getLocale, getTranslations } from "next-intl/server";
import { LeadsTable, type LeadRow } from "@/components/leads/leads-table";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";
import { ListTail } from "@/components/ui-ext/list-tail";
import { listNonWorkingDays } from "@/lib/calendar";
import { firstOfMonth, todayRiyadh } from "@/lib/dates";
import { filesLeads, seesAllRoles } from "@/lib/floor";
import { ageLeads, countLeads, listLeads } from "@/lib/leads";
import { LIST_LIMIT } from "@/lib/list-size";
import { floorHolderOptions } from "@/lib/pickers";
import { homeFor, requireUser } from "@/lib/authz";
import { redirect } from "@/i18n/navigation";

/**
 * Leads — marketing's module, and the manager's window onto it (SPEC §3, P12-7).
 *
 * "Marketing does not use the Add company form. Marketing has its own module
 * for bringing in a lead, and creating one there IS an assignment: it goes to a
 * chosen rep, or to a member of the marketing team."
 *
 * So the screen answers one question — what have we brought in, and has anybody
 * picked it up — and its primary action files a new one. Marketing reads what
 * it brought in; a manager and an admin read everybody's, which is what every
 * other list in this app does (S8). A rep has no leads screen at all: one given
 * to him is work waiting on his day, not a list to browse.
 *
 * Nobody else gets here, and a rep who follows a link goes to his own home
 * rather than to an error page: it is not his screen, and there is nothing here
 * for him to be told off about (S8, the same answer the team screen gives).
 *
 * No search box and no filters. A lead is a row that lives for two days before
 * somebody picks it up and becomes an ordinary customer; the list is short by
 * construction, and anything older is on the companies screen under its own
 * name.
 */
export default async function LeadsPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const mayFile = filesLeads(user.role);
  if (!mayFile && !seesAllRoles(user.role)) redirect({ href: homeFor(user.role), locale });

  const today = todayRiyadh();
  const t = await getTranslations();
  const [leads, targets] = await Promise.all([
    listLeads(user, LIST_LIMIT),
    // Read on the server for the dialog, so the form opens on a list that is
    // already there. Only for whoever may actually file one.
    mayFile ? floorHolderOptions(null, (role) => t(`common.${role}`)) : Promise.resolve([]),
  ]);

  /*
   * How many there are in all, asked only when the list came back full (D80).
   *
   * And the holidays every wait on this screen crosses, back to the oldest lead
   * on it — the same read the manager's stuck list makes, for the same reason:
   * a lead filed on the 28th must not age a holiday on the 30th as a working
   * day (D97, D141). Unacknowledged rows sort first, so the earliest day this
   * page counts from is the earliest day on any of them.
   */
  const total = leads.length === LIST_LIMIT ? await countLeads(user) : leads.length;
  const earliest = leads.reduce(
    (soonest, lead) => (lead.givenOn < soonest ? lead.givenOn : soonest),
    firstOfMonth(today),
  );
  const nonWorking = await listNonWorkingDays(earliest, today);

  const rows: LeadRow[] = ageLeads(leads, today, nonWorking).map((lead) => ({
    id: lead.id,
    name: lead.name,
    query: lead.query,
    fromName: lead.fromName,
    repName: lead.repName,
    givenOn: lead.givenOn,
    acknowledgedOn: lead.acknowledgedOn,
    waited: lead.waited,
    city: lead.city,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("leads.title")}</h1>
        {mayFile ? <NewLeadDialog targets={targets} /> : null}
      </div>

      {rows.length === 0 ? (
        /* The sentence alone: File a lead is already in the heading row above,
           and an empty list that repeats its own primary action puts two brand
           gradients on one screen (DESIGN §2, D31, D35). */
        <div className="card-face flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="max-w-prose text-sm text-muted-foreground">
            {mayFile ? t("leads.empty") : t("common.nothingYet")}
          </p>
        </div>
      ) : (
        // Who found it is only worth a column on a screen that reads more than
        // one person's: marketing's own list would say its own name on every
        // row (D46 — a figure nobody can read two ways).
        <LeadsTable rows={rows} showFinder={seesAllRoles(user.role)} />
      )}

      <ListTail shown={rows.length} total={total} />
    </div>
  );
}
