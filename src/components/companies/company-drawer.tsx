import { ChevronRight, FileText, Pencil, Plus, Star } from "lucide-react";
import { optionValue } from "@/lib/picker-option";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList, type ActivityEntry } from "@/components/activities/activity-list";
import {
  LogDialogHost,
  type LogContact,
  type LogProject,
} from "@/components/activities/log-dialog";
import { CompanyDrawerFrame, CompanyHeader } from "@/components/companies/company-header";
import { AcknowledgeLeadButton } from "@/components/leads/acknowledge-lead-button";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ArchiveContactDialog } from "@/components/contacts/archive-contact-dialog";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { MakeMainButton } from "@/components/contacts/make-main-button";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { QuotationMiniList } from "@/components/quotations/quotation-mini-list";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Prose } from "@/components/ui-ext/prose";
import { PhoneLinks } from "@/components/ui-ext/phone-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { listActivitiesForCompany } from "@/lib/activities";
import { issuesOwnQuotations, mayHandOver, mayQuote, mayShare, mayWrite } from "@/lib/floor";
import { NotAllowed, requireUser } from "@/lib/authz";
import { getCompany, type CompanyDetail } from "@/lib/companies";
import { floorHolderOptions } from "@/lib/pickers";
import { companySharers } from "@/lib/shares";
import { mayKeepContacts, mayRaiseFor, mayWorkProject } from "@/lib/visibility";
import { listQuotationsForCompany } from "@/lib/quotations";
import { DayText } from "@/components/ui-ext/day-text";
import { dayOf, formatDay } from "@/lib/dates";
import { lossReasonLabel } from "@/lib/loss-reason";
import { formatSqm } from "@/lib/money";
import { TONE_CLASS, TONE_TEXT } from "@/lib/state-tone";
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
      <div className="flex flex-col gap-2 p-4">
        <SheetTitle className="text-base">{t("common.nothingYet")}</SheetTitle>
        <SheetDescription>{t("drawer.companyGone")}</SheetDescription>
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
  const logContacts: LogContact[] = contacts.map((row) => ({ id: row.id, name: row.name }));
  const quotations = await listQuotationsForCompany(user, company.id);
  // A lost project is closed (SPEC S20); nothing new is logged against it. And
  // an entry that names a project is guarded by the project, not the company
  // (`assertProjectMine`, D147), so the picker offers only the jobs this reader
  // actually works — its own rep, or somebody put on it.
  const logProjects: LogProject[] = projects
    .filter((row) => !row.lostAt && mayWorkProject(user, row.repId, row.onProject))
    .map((row) => ({ id: row.id, name: row.name }));
  /*
   * The open projects this reader may raise a quotation ON: every quotation
   * belongs to one (S18, D94), so the dialog asks which, and there are two ways
   * in now — the customer is his, or the job is one he was put on (D147).
   *
   * The same sentence `requestQuotationAction` guards itself with, asked per
   * row, so the picker never offers a job the action would refuse and never
   * hides one it would allow (DESIGN §5).
   */
  const quotationProjects = projects
    .filter((row) => !row.lostAt && mayRaiseFor(user, company.repId, row.repId, row.onProject))
    .map((row) => ({
      value: optionValue(row.id, company.id),
      label: row.name,
    }));

  const addContactTrigger = (
    <Button variant="outline">
      <Plus aria-hidden="true" />
      {t("drawer.addContact")}
    </Button>
  );
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

  // One log dialog for the whole drawer (D82): the header's Log button and
  // the Correct button on every history entry press the same form.
  return (
    <LogDialogHost
      targets={{
        [company.id]: { companyName: company.name, contacts: logContacts, projects: logProjects },
      }}
    >
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
        }}
        standing={company.standing}
        mine={mine}
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
          className="mx-4 mt-3 flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2.5 text-xs"
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
        what the customer originally asked for is the one thing about him
        nobody can reconstruct later.
      */}
      {company.lead ? (
        <div
          className={cn(
            "mx-4 mt-3 flex flex-col gap-2 rounded-lg px-3 py-2.5",
            company.lead.acknowledged ? "bg-surface-2" : TONE_CLASS.wait,
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium">
              {t("leads.fromPerson", { name: company.lead.fromName })}
            </span>
            {company.lead.acknowledged ? null : company.lead.mine ? (
              <AcknowledgeLeadButton companyId={company.id} />
            ) : (
              // A manager reading somebody else's lead is told the state and
              // offered nothing: the answer is the holder's to give.
              <span className="text-xs font-medium">{t("leads.notAcknowledged")}</span>
            )}
          </div>
          {/* The customer's own words, in whichever language he used. */}
          <Prose line text={company.lead.query} className="text-xs" />
        </div>
      ) : null}

      <Tabs defaultValue="activity" className="gap-3 px-4 py-3">
        <TabsList className="w-full">
          <TabsTrigger value="activity">{t("drawer.activity")}</TabsTrigger>
          <TabsTrigger value="contacts">{t("common.contacts")}</TabsTrigger>
          <TabsTrigger value="projects">{t("common.projects")}</TabsTrigger>
          <TabsTrigger value="quotations">{t("common.quotations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <ActivityList
            activities={entries}
            // No action in the panel: Log is in the drawer's action row a
            // centimetre above and never moves. A second copy of it inside the
            // empty state would be the same button twice — and, being inside a
            // branch that vanishes the moment it works, the copy that loses its
            // own confirmation (see the note on EmptyPanel).
            empty={<EmptyPanel sentence={t("drawer.emptyActivity")} />}
            // Corrections, on the reader's own entries (D70).
            correct
          />
        </TabsContent>

        <TabsContent value="contacts" className="flex flex-col gap-3">
          {/* Not `mine`: two reps on one customer have each met people there,
              and the same person on both lists is not a duplicate (SPEC §3).
              This is the one write a company share carries. */}
          {keepsContacts ? (
            <div className="flex">
              <AddContactDialog
                companyId={company.id}
                country={company.countryCode}
                trigger={addContactTrigger}
              />
            </div>
          ) : null}
          {contacts.length === 0 ? (
            <EmptyPanel sentence={t("drawer.emptyContacts")} />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {contacts.map((row) => {
                  // A contact belongs to whoever added him, and only he edits,
                  // archives or makes him the main one — the same answer
                  // `assertContactMine` gives, so a shared company offers
                  // nothing on the other rep's rows that the action would
                  // refuse (D147, DESIGN §5).
                  const myContact = mayWrite(user, row.repId);
                  return (
                  <li key={row.id} className="card-face flex flex-col gap-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        <bdi>{row.name}</bdi>
                      </span>
                      {/* Whose person this is, and only where the answer is not
                          obvious. Two reps on one customer each keep their own
                          contacts (§3, D147) and a fold puts both lists on one
                          record — so the same buyer, with the same number, is
                          two rows here, and without a name on them the drawer
                          reads as a screen showing one person twice. On a
                          company one person keeps people on, saying it on every
                          row would be a word that never varies. */}
                      {manyKeepers ? (
                        <span className="text-xs text-muted-foreground">
                          {t("drawer.contactKeptBy", { name: row.repName })}
                        </span>
                      ) : null}
                      {row.isMain ? (
                        <Badge variant="secondary" className="gap-1">
                          <Star aria-hidden="true" />
                          {t("drawer.mainContact")}
                        </Badge>
                      ) : myContact ? (
                        <MakeMainButton contactId={row.id} name={row.name} />
                      ) : null}
                      {/* Pushed to the far edge: a rep reads the name and the
                          number, and only occasionally comes here to change
                          one. A manager reading the floor gets the name and the
                          number and nothing to press (D42), and so does a rep
                          reading the row his colleague added (D147). */}
                      {myContact ? (
                      <span className="ms-auto flex items-center gap-1">
                        <EditContactDialog
                          country={company.countryCode}
                          contact={{
                            id: row.id,
                            name: row.name,
                            phone: row.phone,
                            position: row.position,
                            email: row.email,
                            notes: row.notes,
                          }}
                          trigger={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Pencil aria-hidden="true" className="size-3.5" />
                              {t("common.edit")}
                            </Button>
                          }
                        />
                        <ArchiveContactDialog contactId={row.id} contactName={row.name} />
                      </span>
                      ) : null}
                    </div>
                    {row.position ? (
                      <span className="text-xs text-muted-foreground">
                        <span className="sr-only">{t("common.position")}: </span>
                        {row.position}
                      </span>
                    ) : null}
                    {/* What was written about this person — which floor he
                        sits on, when he is reachable — read back on his own
                        card (D136). A line under the name, not a paragraph. */}
                    {row.notes ? (
                      <Prose
                        line
                        text={row.notes}
                        slot="contact-notes"
                        className="line-clamp-2 text-xs text-muted-foreground"
                      />
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {/* A tap opens WhatsApp and the handset dials; the number
                          itself is the link text, so it is always readable
                          (SPEC §3, D98). */}
                      <PhoneLinks name={row.name} phone={row.phoneNormalized} />
                      {row.email ? (
                        <a
                          href={`mailto:${row.email}`}
                          className="truncate text-muted-foreground hover:underline"
                        >
                          {row.email}
                        </a>
                      ) : null}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </>
          )}
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
                      className="card-face flex items-center gap-3 p-3 transition-colors hover:bg-surface-2"
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
                          <span>
                            <span className="sr-only">{t("common.nextFollowUp")}: </span>
                            <DayText day={row.nextFollowUp} locale={locale} />
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
          {/* Quoting is the sales conversation: marketing works the lead and
              hands it on, so it owns this company and does not price it (P8.9).
              The list already carries that answer per job (D147), so a rep put
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
    </LogDialogHost>
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
function EmptyPanel({ sentence, action }: { sentence: string; action?: ReactNode }) {
  return (
    <div className="card-face flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="max-w-prose text-sm text-muted-foreground">{sentence}</p>
      {action}
    </div>
  );
}

/**
 * Never a blank panel (DESIGN §2). The sheet is already open and already has a
 * name for assistive technology while the query is still running — Radix wants
 * a title from the first frame, not the second.
 */
function CompanyDrawerSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 p-4">
      <SheetTitle className="sr-only">{title}</SheetTitle>
      <SheetDescription className="sr-only">{description}</SheetDescription>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-12 w-full rounded-[calc(var(--radius)+4px)]" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-20 w-full rounded-[calc(var(--radius)+4px)]" />
        ))}
      </div>
    </div>
  );
}
