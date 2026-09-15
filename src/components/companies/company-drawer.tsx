import { ChevronRight, FileText, Plus } from "lucide-react";
import { optionValue } from "@/lib/picker-option";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList, type ActivityEntry } from "@/components/activities/activity-list";
import { CompanyDrawerFrame, CompanyHeader } from "@/components/companies/company-header";
import { AcknowledgeLeadButton } from "@/components/leads/acknowledge-lead-button";
import { ContactList } from "@/components/contacts/contact-list";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { QuotationMiniList } from "@/components/quotations/quotation-mini-list";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import { Empty } from "@/components/ui-ext/empty";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Prose } from "@/components/ui-ext/prose";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { listActivitiesForCompany, mayReportOn } from "@/lib/activities";
import { issuesOwnQuotations, mayHandOver, mayQuote, mayShare, mayWrite } from "@/lib/floor";
import { NotAllowed, requireUser } from "@/lib/authz";
import { getCompany, type CompanyDetail } from "@/lib/companies";
import { floorHolderOptions } from "@/lib/pickers";
import { companySharers } from "@/lib/shares";
import { mayKeepContacts, mayRaiseFor } from "@/lib/visibility";
import { raisesOnBehalf } from "@/lib/on-behalf";
import { listQuotationsForCompany } from "@/lib/quotations";
import { DayText } from "@/components/ui-ext/day-text";
import { dayOf, formatDay } from "@/lib/dates";
import { lossReasonLabel } from "@/lib/loss-reason";
import { formatSqm } from "@/lib/money";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The company drawer (SPEC §3, DESIGN §2 — work happens in a drawer over the
 * list). This half is the server half: it reads the company and its log and
 * hands the result to the client chrome in company-header.tsx as children, so
 * the tabs, the contacts and the projects never reach the browser as code.
 *
 * Being server rendered is also what makes `router.refresh()` enough after a
 * log entry or a new contact: the drawer and the page's follow-up strip come
 * back together, from one query each, with no second copy of the data.
 *
 * `?open=<id>` is read by the page, which passes the id here; null renders
 * nothing at all.
 */

/** Whatever the data slice returns, named once so a drift shows up here. */
type Company = NonNullable<Awaited<ReturnType<typeof getCompany>>>;
type CompanyContact = Company["contacts"][number];
type CompanyProject = Company["projects"][number];

export async function CompanyDrawer({ companyId }: { companyId: string | null }) {
  if (!companyId) return null;
  const t = await getTranslations("drawer");

  return (
    // Keyed by the company so switching rows resets the sheet rather than
    // animating one company's header into another's.
    <CompanyDrawerFrame key={companyId}>
      <Suspense
        fallback={
          <CompanyDrawerSkeleton title={t("loadingCompany")} description={t("aboutCompany")} />
        }
      >
        <CompanyDrawerBody companyId={companyId} />
      </Suspense>
    </CompanyDrawerFrame>
  );
}

async function CompanyDrawerBody({ companyId }: { companyId: string }) {
  const [t, locale, user] = await Promise.all([getTranslations(), getLocale(), requireUser()]);

  /*
   * `?open=` is whatever is in the address bar, so all three answers below end
   * at the same panel:
   *
   * - Not a uuid at all. Postgres refuses the cast, and an edited URL would
   *   otherwise take down the whole companies screen rather than the drawer.
   * - No such company.
   * - Somebody else's company. `getCompany` throws NotAllowed — the same gate
   *   the actions use — and a rep who follows a colleague's link should be told
   *   there is nothing here, not shown that a company he cannot open exists.
   */
  let company: CompanyDetail | null = null;
  if (z.uuid().safeParse(companyId).success) {
    try {
      company = await getCompany(user, companyId, locale);
    } catch (error) {
      if (!(error instanceof NotAllowed)) throw error;
    }
  }

  if (!company) {
    return (
      <div data-slot="company-gone" className="flex flex-col gap-2 p-4 pe-12">
        {/* What happened, then what is left to do — not "Nothing here yet",
            which promises something is coming. */}
        <SheetTitle className="text-base">{t("drawer.companyGone")}</SheetTitle>
        <SheetDescription>{t("drawer.companyGoneMeans")}</SheetDescription>
      </div>
    );
  }

  // Handed straight through, not copied field by field. It WAS copied, and the
  // copy silently dropped `mine` and `dayOpen` the day they were added, so the
  // correction controls rendered on nothing and the failure looked like a
  // missing button rather than a missing field (D70). A mapping between two
  // nearly identical shapes is a second copy, and the second copy drifts (D64).
  const entries: ActivityEntry[] = await listActivitiesForCompany(user, companyId);

  /**
   * Whose floor this is. A manager and an admin open every company and write on
   * none (S8, D42) — the same answer the actions give, so nothing on screen
   * offers work the server would refuse (DESIGN §5). A manager who sells passes
   * this on his own companies, because his id is the one on them.
   */
  // The rule, not a copy of it: `mayWrite` is what the actions ask, so the
  // drawer offers exactly the work the server would allow — including none of
  // it while an admin is viewing as somebody (D42, P8.8).
  const mine = mayWrite(user, company.repId);

  /*
   * The two questions about belonging, and who may answer each (D50, D147).
   *
   * Who this customer BELONGS to is the manager's question as much as the
   * owner's; who else is ON it is granted by the same three people and means
   * something else entirely. They are separate predicates on purpose — a
   * handover moves the metres and a share does not — and they happen to want
   * the same list of people, which is read once rather than twice.
   *
   * Who is on it is read for EVERY reader, because the header says it in words
   * to every reader: a rep put on a colleague's customer has to be able to see
   * that he is on it.
   */
  const canHandOver = mayHandOver(user);
  const canShare = mayShare(user, company.repId);
  const sharers = await companySharers(company.id);
  const floorHolders =
    canHandOver || canShare
      ? await floorHolderOptions(company.repId, (role) => t(`common.${role}`))
      : [];
  const handOverTo = canHandOver ? floorHolders : null;
  // Its rep is already off this list; everybody on it comes off too, so the
  // picker never offers a share the action would answer "It is already theirs"
  // to (DESIGN §5).
  const shareWith = canShare
    ? floorHolders.filter((option) => !sharers.some((person) => person.id === option.value))
    : null;

  /**
   * The one thing a company share carries besides reading: his own contacts on
   * it (SPEC §3, D147). Adding is `mayKeepContacts` — its rep, or anybody it is
   * shared with — and changing one is a different question with a different
   * answer, asked per row below: a contact belongs to whoever added him.
   */
  const keepsContacts = mayKeepContacts(user, company.repId, company.shared);

  const contacts: readonly CompanyContact[] = company.contacts;
  // More than one person keeps people on this customer (D147). Asked of the
  // rows themselves rather than of the share list: a company can be shared with
  // somebody who has added nobody, and what the reader needs to be told apart
  // is the rows in front of him.
  const manyKeepers = new Set(contacts.map((row) => row.repId)).size > 1;
  const projects: readonly CompanyProject[] = company.projects;
  const quotations = await listQuotationsForCompany(user, company.id);
  // A report on this customer: his own, or one shared with him (D147) — the
  // same sentence `addReportAction` guards itself with, so the button is here
  // exactly when the popup behind it would be accepted (DESIGN §5).
  const reports = !company.archivedAt && mayReportOn(user, company.repId, company.shared);
  /*
   * The open projects this reader may raise a quotation ON: every quotation
   * belongs to one (S18, D94), so the dialog asks which, and there are two ways
   * in now — the customer is his, or the job is one he was put on (D147).
   *
   * The same sentence `requestQuotationAction` guards itself with, asked per
   * row, so the picker never offers a job the action would refuse and never
   * hides one it would allow (DESIGN §5).
   */
  //
  // The coordinator raises for whoever works them (SPEC §3 P13), so her button
  // is on every live customer with an open job; the dialog's "For" field then
  // offers only the people who may raise on one of them.
  const forOthers = raisesOnBehalf(user) && !company.archivedAt;
  const quotationProjects = projects
    .filter(
      (row) =>
        !row.lostAt && (forOthers || mayRaiseFor(user, company.repId, row.repId, row.onProject)),
    )
    .map((row) => ({
      value: optionValue(row.id, company.id),
      label: row.name,
    }));

  const newProjectTrigger = (
    <Button variant="outline">
      <Plus aria-hidden="true" />
      {t("drawer.newProject")}
    </Button>
  );
  // She does not ask the desk for a price; she IS the desk (SPEC §3), so the
  // same door says Issue and the form behind it asks for the SMAC number.
  const direct = issuesOwnQuotations(user.role);
  const requestQuotationTrigger = (
    <Button variant="outline">
      <FileText aria-hidden="true" />
      {t(direct ? "quotations.issueOwn" : "quotations.request")}
    </Button>
  );

  // The header's Add report and the Correct on every history entry open the
  // one popup the top bar mounts for the whole app (D82).
  return (
    <>
      <CompanyHeader
        company={{
          id: company.id,
          name: company.name,
          // A picked Saudi city, or the free text a company elsewhere carries
          // (SPEC §3). The header shows one word either way.
          city: company.cityName ?? company.cityText,
          category: company.categoryName,
          leadSource: company.leadSourceName,
          repName: company.repName,
          nextFollowUp: company.nextFollowUp,
          projectFollowUp: company.projectFollowUp,
          notes: company.notes,
          // The ids, not the words: Edit opens on the rows the lookups hold,
          // so renaming a category in Lookups cannot move this company.
          editable: {
            id: company.id,
            name: company.name,
            categoryId: company.categoryId,
            leadSourceId: company.leadSourceId,
            // And its word, for the one source a rep is not offered (§5 #168).
            leadSourceName: company.leadSourceName,
            countryId: company.countryId,
            cityId: company.cityId,
            cityText: company.cityText,
            notes: company.notes,
          },
          leadWaiting: company.lead !== null && !company.lead.acknowledged,
          archived: Boolean(company.archivedAt),
        }}
        standing={company.standing}
        mine={mine}
        reports={reports}
        handOverTo={handOverTo}
        sharers={sharers}
        shareWith={shareWith}
        me={user.id}
      />

      {/*
        What this record turned out to be (P12-8).

        First, above everything else about it, because it changes what the rest
        of the drawer means: these contacts and this history belong to a record
        that is no longer the record. "Archived" alone would have said somebody
        gave this customer up, which is not what happened.

        The survivor's name is a door only for a reader who may open it, which
        is D121's rule and not a new one; for everybody else the sentence names
        the person holding it, who is the one to ring.
      */}
      {company.folded ? (
        /* A fact the drawer opens holding, not an announcement: no `role="status"`,
           which is a live region and would have this read out again over whatever
           the reader was on. The slot is how a walk names it (P12-8). */
        <div
          data-slot="folded-band"
          className="mx-4 mt-4 flex flex-col gap-1 rounded-xl bg-surface-2 p-3 text-xs"
        >
          <span className="font-medium">
            {t("duplicates.foldedInto", {
              name: company.folded.intoName,
              rep: company.folded.intoRepName,
            })}
          </span>
          {company.folded.mine ? (
            <Link
              href={`/companies?open=${company.folded.intoId}`}
              scroll={false}
              data-slot="open-survivor"
              className="w-fit underline underline-offset-2 hover:text-foreground"
            >
              {t("forms.openMatch", { name: company.folded.intoName })}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/*
        Where this customer came from, when marketing filed him as a lead
        (SPEC §3, P12-7). Above the tabs, because it is the first thing the
        person who has just been handed him needs to read, and it stops being
        prominent the moment he says he has it: amber with a button while it is
        unanswered, a quiet line afterwards. It stays on the drawer for good —
        "once acknowledged, the lead is a normal company owned by the rep,
        keeping its origin" (§3 P13): who filed it, the source it was filed
        under, and what the customer originally asked for, which is the one
        thing about him nobody can reconstruct later.

        One layout in both languages (P13-G6): the sentence first, then the
        button — at the inline end on a desk, under the words on a phone. It
        was a wrapping row, so the English origin line, longer than the Arabic,
        pushed Acknowledge ABOVE the customer's words while the Arabic kept it
        beside them. "Not acknowledged" is not repeated here: it is the word
        beside the drawer's avatar, which wears the amber ring for it.
      */}
      {company.lead ? (
        <div
          data-slot="lead-origin"
          className={cn(
            "mx-4 mt-4 flex flex-col gap-2 rounded-xl p-3 md:flex-row md:items-center md:gap-4",
            "border border-line bg-surface-2",
            // No amber fill (P4): "Not acknowledged" is the dot and word beside
            // the drawer's avatar; a tinted box with an amber title said it twice.
            company.lead.acknowledged ? null : "border-state-wait-fg/40",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-medium">
              {t("leads.origin", { name: company.lead.fromName, source: company.leadSourceName })}
            </span>
            {/* The customer's own words, in whichever language he used. */}
            <Prose line text={company.lead.query} className="text-xs" />
          </div>
          {/* Only its holder answers it; anybody else is told the state beside
              the avatar and offered nothing (D157). */}
          {!company.lead.acknowledged && company.lead.mine ? (
            <div className="flex shrink-0 justify-end">
              <AcknowledgeLeadButton companyId={company.id} />
            </div>
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="activity" className="gap-3 px-4 py-4">
        <TabsList className="w-full">
          <TabsTrigger value="activity">{t("drawer.activity")}</TabsTrigger>
          <TabsTrigger value="contacts">{t("common.contacts")}</TabsTrigger>
          <TabsTrigger value="projects">{t("common.projects")}</TabsTrigger>
          {/* The short word below `sm`: four tabs share a phone's width, and
              «عروض الأسعار» was cut at its edge. The name stays the full one. */}
          <TabsTrigger value="quotations" aria-label={t("common.quotations")}>
            <span aria-hidden="true" className="sm:hidden">
              {t("shell.shortQuotations")}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              {t("common.quotations")}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <ActivityList
            activities={entries}
            // No action in the panel: Add report is in the drawer's action row a
            // centimetre above and never moves. A second copy of it inside the
            // empty state would be the same button twice — and, being inside a
            // branch that vanishes the moment it works, the copy that loses its
            // own confirmation (see the note on EmptyPanel).
            empty={<EmptyPanel sentence={t("drawer.emptyActivity")} />}
            // Corrections, on the reader's own entries (D70).
            correct
          />
        </TabsContent>

        <TabsContent value="contacts">
          {/* Not `mine` for adding: two reps on one customer have each met
              people there, and the same person on both lists is not a
              duplicate (SPEC §3) — the one write a company share carries. A
              contact belongs to whoever added him, and only he edits, archives
              or makes him the main one: the answer `assertContactMine` gives,
              asked per row here so a shared company offers nothing on the
              other rep's cards that the action would refuse (D147, DESIGN §5). */}
          <ContactList
            companyId={company.id}
            companyName={company.name}
            country={company.countryCode}
            mayAdd={keepsContacts}
            manyKeepers={manyKeepers}
            rows={contacts.map((row) => ({
              id: row.id,
              name: row.name,
              repName: row.repName,
              isMain: row.isMain,
              mine: mayWrite(user, row.repId),
              phone: row.phone,
              phoneNormalized: row.phoneNormalized,
              position: row.position,
              email: row.email,
              notes: row.notes,
            }))}
          />
        </TabsContent>

        <TabsContent value="projects" className="flex flex-col gap-3">
          {mine ? (
            <div className="flex">
              <NewProjectDialog
                companyId={company.id}
                companyName={company.name}
                trigger={newProjectTrigger}
              />
            </div>
          ) : null}
          {projects.length === 0 ? (
            <EmptyPanel sentence={t("drawer.emptyProjects")} />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {projects.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/projects?open=${row.id}`}
                      className="card-face hover-tint flex items-center gap-3 p-3"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{row.name}</span>
                          {row.lostAt ? (
                            <StateBadge tone="bad">{t("drawer.lost")}</StateBadge>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            <span className="sr-only">{t("common.expectedSqm")}: </span>
                            {row.expectedSqm ? (
                              <>
                                <span className="num">{formatSqm(row.expectedSqm)}</span>{" "}
                                {t("common.sqm")}
                              </>
                            ) : (
                              "—"
                            )}
                          </span>
                          {/* The date in its waiting colour and, where it is
                              late or due, the word that colour stands for. */}
                          <span
                            className={cn(
                              "inline-flex items-center gap-2",
                              row.followUpState === "overdue" && TONE_TEXT.bad,
                              row.followUpState === "today" && TONE_TEXT.wait,
                            )}
                          >
                            <span className="sr-only">{t("common.nextFollowUp")}: </span>
                            <DayText day={row.nextFollowUp} locale={locale} />
                            {row.followUpState === "overdue" ? (
                              <span className="font-medium">{t("common.overdue")}</span>
                            ) : row.followUpState === "today" ? (
                              <span className="font-medium">{t("common.dueToday")}</span>
                            ) : null}
                          </span>
                        </span>
                        {row.lostAt ? (
                          <span className={cn("text-xs", TONE_TEXT.bad)}>
                            {t("drawer.lostOn", { date: formatDay(dayOf(row.lostAt), locale) })}
                            {/* The reason is one of nine codes or, for "Other",
                                somebody's own words, so it is translated on the
                                way out — this screen printed the code itself
                                until P11J. Joined by a neutral dash it settles
                                against the paragraph rather than against itself
                                (rules/words.md). */}
                            {row.lostReason ? (
                              <>
                                {" — "}
                                <bdi>{lossReasonLabel(row.lostReason, t)}</bdi>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-faint rtl:rotate-180"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        <TabsContent value="quotations" className="flex flex-col gap-3">
          {/* Whoever may quote on this customer's jobs — marketing too since
              SPEC §3 P13 made it a rep (D168). The list already carries that
              answer per job (D147), so a rep put
              on one project of somebody else's customer gets the button here
              too, with only that job in its picker. */}
          {quotationProjects.length > 0 ? (
            <div className="flex">
              <RequestQuotationDialog
                companyId={company.id}
                // The customer is known, so only the job is asked for: the
                // dialog draws whichever links of company → project → contact
                // it does not already have (P12-9).
                targets={{ companies: [], projects: quotationProjects }}
                issuesDirectly={direct}
                trigger={requestQuotationTrigger}
              />
            </div>
          ) : mayQuote(user, company.repId) ? (
            // No open project, so no button that the action would refuse
            // (DESIGN §5): the sentence says what to do first.
            <p className="text-sm text-muted-foreground">{t("quotations.needsProject")}</p>
          ) : null}
          {quotations.length === 0 ? (
            <EmptyPanel sentence={t("quotations.emptyForCompany")} />
          ) : (
            <QuotationMiniList rows={quotations} />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * One sentence for an empty list, in every tab.
 *
 * The action that fills the list is NOT in here. It sits above the panel and
 * stays there once the list has something in it, which is a rule about React as
 * much as about layout: a dialog rendered inside the empty branch is torn down
 * by the very save that empties that branch, and an unmounted dialog never runs
 * the effect that raises its "Saved" toast or opens the record it just made.
 * The first quotation a rep ever raised on a project saved silently and left
 * him where he started; the second worked. Anything that opens a dialog is
 * rendered in one position, whatever the list underneath it says (D35).
 */
function EmptyPanel({ sentence }: { sentence: string }) {
  return <Empty size="panel">{sentence}</Empty>;
}

/**
 * Never a blank panel (DESIGN §2). The sheet is already open and already has a
 * name for assistive technology while the query is still running — Radix wants
 * a title from the first frame, not the second.
 *
 * In the drawer's own shape (DESIGN §1b, P13-G6): the avatar's 40px square
 * beside the name and its line, the strip of four figures, the follow-up
 * panel, the two buttons and the menu's place at the far end, the tabs, and
 * cards of the history's height. It stood in with a bar of 48 where the strip
 * is 64 and three buttons in a row that now holds two, so the drawer jumped as
 * the company arrived.
 */
function CompanyDrawerSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <div role="status" aria-busy="true" data-slot="company-drawer-skeleton" className="flex flex-col">
      <SheetTitle className="sr-only">{title}</SheetTitle>
      <SheetDescription className="sr-only">{description}</SheetDescription>
      <div className="flex flex-col gap-4 border-b border-line p-4">
        <div className="flex items-start gap-3 pe-10">
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="ms-auto size-6 rounded-md" />
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-9 w-full rounded-lg" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
