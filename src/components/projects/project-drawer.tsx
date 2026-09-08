import { getLocale, getTranslations } from "next-intl/server";
import { LogDialogHost } from "@/components/activities/log-dialog";
import { ActivityList } from "@/components/activities/activity-list";
import { ProjectSheet } from "@/components/projects/projects-table";
import { ShareProjectDialog } from "@/components/projects/share-project-dialog";
import { QuotationMiniList } from "@/components/quotations/quotation-mini-list";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { NotAllowed, requireUser } from "@/lib/authz";
import { getCompany } from "@/lib/companies";
import { dayOf } from "@/lib/dates";
import { mayShare, mayWrite } from "@/lib/floor";
import { floorHolderOptions } from "@/lib/pickers";
import { getProject } from "@/lib/projects";
import { projectSharers } from "@/lib/shares";
import { mayRaiseFor, mayWorkProject } from "@/lib/visibility";
import { projectStanding } from "@/lib/standing";
import { listQuotationsForProject } from "@/lib/quotations";

/**
 * The project drawer (DESIGN §2: work happens in drawers over a list). It is a
 * server component, so the sheet's contents are read with the request that
 * opened it — `?open=<id>` is the whole state, and a refresh or a shared link
 * reopens exactly this.
 *
 * Everything interactive — closing back to the list, the follow-up picker, Log
 * and Mark lost — lives in `ProjectSheet`, the client half in projects-table.tsx,
 * beside the rest of this screen's URL handling. This file only reads and hands
 * over.
 *
 * The company is read as well as the project because the Log dialog offers the
 * company's contacts and its other projects. `getProject` deliberately returns
 * the project and its own log; re-deriving either list here would be the second
 * definition the data rules forbid.
 */

/** `lost_at` is an instant; the header names the Riyadh day it fell on. */
function toDay(value: Date | string | null): string | null {
  if (!value) return null;
  return dayOf(value instanceof Date ? value : new Date(value));
}

export async function ProjectDrawer({ projectId }: { projectId: string | null }) {
  if (!projectId) return null;

  const [user, locale, t] = await Promise.all([requireUser(), getLocale(), getTranslations()]);

  /*
   * No drawer, and no error page, over a link that no longer works — whichever
   * way it fails. An id that is not a uuid would take the cast down in
   * Postgres; a project on somebody else's company throws NotAllowed, and a rep
   * following a colleague's link is told there is nothing here rather than
   * shown that a project he cannot open exists.
   */
  if (!z.uuid().safeParse(projectId).success) return null;

  let project: Awaited<ReturnType<typeof getProject>> = null;
  try {
    project = await getProject(user, projectId, locale);
  } catch (error) {
    if (!(error instanceof NotAllowed)) throw error;
  }
  if (!project) return null;

  const company = await getCompany(user, project.companyId, locale);
  const contacts = company?.contacts ?? [];
  const projects = company?.projects ?? [];
  const [quotations, standing] = await Promise.all([
    listQuotationsForProject(user, project.id),
    projectStanding(project.id),
  ]);

  /**
   * Two questions about this job, and they stopped having one answer in P12
   * (D147).
   *
   * WORKING it — logging against it, moving its follow-up date, raising a
   * quotation or a dispatch on it — belongs to its own rep and to everybody it
   * has been shared with: a shared project is a worked project. That is what
   * `assertProjectMine` asks, so the drawer offers exactly what the actions
   * allow (DESIGN §5).
   *
   * OWNING the row — renaming it, marking it lost, archiving it — belongs to
   * whoever added it and to nobody else, because an item belongs to its author
   * (SPEC §3). A helper on a job does not close it.
   *
   * Neither is the company's rep any more: a project can sit on a customer
   * whose floor is somebody else's, and seeing the customer is not working the
   * job. A manager and an admin open everybody's and work none (S8, D42).
   */
  const mine = mayWorkProject(user, project.repId, project.onProject);
  const owns = mayWrite(user, project.repId);

  /*
   * Who else is on this job, and whether this reader may change that. Read for
   * everybody, because the drawer says it in words to every reader — a rep put
   * on a colleague's job has to be able to see that he is on it, and so does
   * the manager reading the floor.
   *
   * `floorHolderOptions` takes the project's own rep off the picker; everybody
   * already on it comes off too, so it never offers a share the action would
   * answer "It is already theirs" to.
   */
  const sharers = await projectSharers(project.id);
  const shareWith = mayShare(user, project.repId)
    ? (await floorHolderOptions(project.repId, (role) => t(`common.${role}`))).filter(
        (option) => !sharers.some((person) => person.id === option.value),
      )
    : null;

  // A lost project is finished work (S20): nothing new is raised against it,
  // so the button is not there rather than there and refusing (DESIGN §5).
  // Marketing works a lead like a rep and stops at the price: quoting is the
  // sales conversation, and it belongs to whoever the lead was handed to (P8.9).
  // Two ways in (D147): the customer is his, or the job is one he was put on —
  // the same sentence `requestQuotationAction` guards itself with.
  const mayRaise = mayRaiseFor(user, project.company.repId, project.repId, project.onProject);
  const requestTrigger = project.lostAt || !mayRaise ? null : (
    <RequestQuotationDialog
      companyId={project.companyId}
      projectId={project.id}
      projectName={project.name}
      trigger={<Button variant="outline">{t("quotations.request")}</Button>}
    />
  );

  // One log dialog for the whole drawer (D82): the sheet's Log button and the
  // Correct button on every history entry press the same form.
  return (
    <LogDialogHost
      targets={{
        [project.companyId]: {
          companyName: project.companyName,
          contacts: contacts.map((row) => ({ id: row.id, name: row.name })),
          // An entry that names a project is guarded by the project, not the
          // company (`assertProjectMine`, D147), so the picker offers the other
          // jobs at this customer only where this reader works them.
          projects: projects.filter((row) => mayWorkProject(user, row.repId, row.onProject)),
        },
      }}
    >
    <ProjectSheet
      projectId={project.id}
      name={project.name}
      companyId={project.companyId}
      companyName={project.companyName}
      cityName={project.company.cityName}
      expectedSqm={project.expectedSqm}
      standing={standing}
      nextFollowUp={project.nextFollowUp}
      followUpState={project.followUpState}
      lostOn={toDay(project.lostAt)}
      lostReason={project.lostReason}
      notes={project.notes}
      mine={mine}
      owns={owns}
      // Who else is on it, in words for every reader, with the control that
      // changes it beside the fact it is about (DESIGN §5). The dialog draws
      // nothing at all for a reader who neither grants a share nor is on one.
      sharing={
        sharers.length > 0 || shareWith ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {sharers.length > 0 ? (
              <p className="min-w-0 text-xs text-muted-foreground">
                {t("drawer.share.onProject")}:{" "}
                {sharers.map((person, index) => (
                  <span key={person.id}>
                    {index > 0 ? (
                      <span aria-hidden="true" className="text-faint">
                        {" · "}
                      </span>
                    ) : null}
                    <bdi>{person.name}</bdi>
                  </span>
                ))}
              </p>
            ) : null}
            <ShareProjectDialog
              projectId={project.id}
              projectName={project.name}
              sharers={sharers}
              people={shareWith}
              me={user.id}
            />
          </div>
        ) : null
      }
      // The request button is in ONE position, whatever the list under it says.
      // Rendered inside the empty branch it was destroyed by the save that
      // filled the list, and the dialog's success handler — the toast, and the
      // jump to the quotation just raised — went with it (D35).
      quotations={
        <div className="flex flex-col gap-3">
          {requestTrigger ? <div className="flex">{requestTrigger}</div> : null}
          {quotations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="max-w-prose text-sm text-muted-foreground">
                {t("quotations.emptyForProject")}
              </p>
            </div>
          ) : (
            <QuotationMiniList rows={quotations} />
          )}
        </div>
      }
      // Log is in the drawer's action row above and never moves, so the empty
      // panel carries the sentence alone (D31, D35).
      activity={
        <ActivityList
          activities={project.activities}
          // The same corrections as the company drawer, on the same entries
          // (D70). The project is preselected because that is where he is.
          correct={{ companyId: project.companyId }}
          empty={
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="max-w-prose text-sm text-muted-foreground">
                {t("projects.emptyActivity")}
              </p>
            </div>
          }
        />
      }
    />
    </LogDialogHost>
  );
}
