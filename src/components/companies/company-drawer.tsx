import { ChevronRight, FileText, MessageCircle, Pencil, Plus, Star } from "lucide-react";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList, type ActivityEntry } from "@/components/activities/activity-list";
import type { LogContact, LogProject } from "@/components/activities/log-dialog";
import { CompanyDrawerFrame, CompanyHeader } from "@/components/companies/company-header";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ArchiveContactDialog } from "@/components/contacts/archive-contact-dialog";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { MakeMainButton } from "@/components/contacts/make-main-button";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { QuotationMiniList } from "@/components/quotations/quotation-mini-list";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { listActivitiesForCompany } from "@/lib/activities";
import { mayHandOver, mayQuote, mayWrite } from "@/lib/floor";
import { NotAllowed, requireUser } from "@/lib/authz";
import { getCompany, type CompanyDetail } from "@/lib/companies";
import { floorHolderOptions } from "@/lib/pickers";
import { listQuotationsForCompany } from "@/lib/quotations";
import { DayText } from "@/components/ui-ext/day-text";
import { dayOf, formatDay } from "@/lib/dates";
import { formatSqm } from "@/lib/money";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";
import { formatPhone, whatsappHref } from "@/lib/phone";

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

  // Who this customer belongs to is the manager's question as much as the
  // owner's (D50). The list is read only when somebody may act on it, so a rep
  // reading a colleague's company costs nothing.
  const handOverTo = mayHandOver(user, company.repId)
    ? await floorHolderOptions(company.repId, (role) => t(`common.${role}`))
    : null;

  const contacts: readonly CompanyContact[] = company.contacts;
  const projects: readonly CompanyProject[] = company.projects;
  const logContacts: LogContact[] = contacts.map((row) => ({ id: row.id, name: row.name }));
  const quotations = await listQuotationsForCompany(user, company.id);
  // A lost project is closed (SPEC S20); nothing new is logged against it.
  const logProjects: LogProject[] = projects
    .filter((row) => !row.lostAt)
    .map((row) => ({ id: row.id, name: row.name }));

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
  const requestQuotationTrigger = (
    <Button variant="outline">
      <FileText aria-hidden="true" />
      {t("quotations.request")}
    </Button>
  );

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
          // The ids, not the words: Edit opens on the rows the lookups hold,
          // so renaming a category in Lookups cannot move this company.
          editable: {
            id: company.id,
            name: company.name,
            categoryId: company.categoryId,
            leadSourceId: company.leadSourceId,
            countryId: company.countryId,
            cityId: company.cityId,
            cityText: company.cityText,
            notes: company.notes,
          },
        }}
        contacts={logContacts}
        projects={logProjects}
        standing={company.standing}
        mine={mine}
        handOverTo={handOverTo}
      />

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
            // What a correction needs, on the reader's own entries (D70).
            correct={{
              companyId: company.id,
              companyName: company.name,
              contacts: logContacts,
              projects: logProjects,
            }}
          />
        </TabsContent>

        <TabsContent value="contacts" className="flex flex-col gap-3">
          {mine ? (
            <div className="flex">
              <AddContactDialog companyId={company.id} trigger={addContactTrigger} />
            </div>
          ) : null}
          {contacts.length === 0 ? (
            <EmptyPanel sentence={t("drawer.emptyContacts")} />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {contacts.map((row) => (
                  <li key={row.id} className="card-face flex flex-col gap-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.name}</span>
                      {row.isMain ? (
                        <Badge variant="secondary" className="gap-1">
                          <Star aria-hidden="true" />
                          {t("drawer.mainContact")}
                        </Badge>
                      ) : mine ? (
                        <MakeMainButton contactId={row.id} name={row.name} />
                      ) : null}
                      {/* Pushed to the far edge: a rep reads the name and the
                          number, and only occasionally comes here to change
                          one. A manager reading the floor gets the name and the
                          number and nothing to press (D42). */}
                      {mine ? (
                      <span className="ms-auto flex items-center gap-1">
                        <EditContactDialog
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
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {/* A tap opens WhatsApp; the number itself is the link
                          text, so it is always readable (SPEC §3). */}
                      <a
                        href={whatsappHref(row.phoneNormalized)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        <MessageCircle aria-hidden="true" className="size-3.5" />
                        <span dir="ltr" className="num">
                          {formatPhone(row.phoneNormalized)}
                        </span>
                        <span className="sr-only">{t("drawer.openWhatsApp")}</span>
                      </a>
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
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        <TabsContent value="projects" className="flex flex-col gap-3">
          {mine ? (
            <div className="flex">
              <NewProjectDialog companyId={company.id} trigger={newProjectTrigger} />
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
                            {/* The reason is somebody's own words: joined by a
                                neutral dash it settled against the paragraph
                                rather than against itself (rules/words.md). */}
                            {row.lostReason ? (
                              <>
                                {" — "}
                                <bdi>{row.lostReason}</bdi>
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
              hands it on, so it owns this company and does not price it (P8.9). */}
          {mayQuote(user, company.repId) ? (
            <div className="flex">
              <RequestQuotationDialog companyId={company.id} trigger={requestQuotationTrigger} />
            </div>
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
