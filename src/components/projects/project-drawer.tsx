import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/activities/activity-list";
import { ProjectSheet } from "@/components/projects/project-sheet";
import { QuotationMiniList } from "@/components/quotations/quotation-mini-list";
import { RequestQuotationDialog } from "@/components/quotations/request-quotation-dialog";
import { Empty } from "@/components/ui-ext/empty";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { mayReportOn } from "@/lib/activities";
import { NotAllowed, requireUser } from "@/lib/authz";
import { dayOf } from "@/lib/dates";
import { issuesOwnQuotations, mayShare, mayWrite } from "@/lib/floor";
import { floorHolderOptions } from "@/lib/pickers";
import { getProject } from "@/lib/projects";
import { projectSharers } from "@/lib/shares";
import { mayRaiseFor, mayWorkProject } from "@/lib/visibility";
import { raisesOnBehalf } from "@/lib/on-behalf";
import { projectStanding } from "@/lib/standing";
import { listQuotationsForProject } from "@/lib/quotations";

/**
 * The project drawer (DESIGN §2: work happens in drawers over a list). It is a
 * server component, so the sheet's contents are read with the request that
 * opened it — `?open=<id>` is the whole state, and a refresh or a shared link
 * reopens exactly this.
 *
 * Everything interactive — closing back to the list, the follow-up picker, Add
 * report and the menu with Edit, Sharing, Archive and Mark lost — lives in
 * `ProjectSheet`, the client half in project-sheet.tsx. This file only reads
 * and hands over. The report popup reads the company's people and
 * papers itself when it opens, so nothing about them is read here.
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
  // A report about the job is a report on its customer: his own, or shared with
  // him (D147) — the gate `addReportAction` asks, so the button is offered
  // exactly where the popup would be accepted (DESIGN §5).
  const reports =
    !project.archivedAt && mayReportOn(user, project.company.repId, project.shared);

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
  // Marketing quotes like a rep since SPEC §3 P13 (D168), so this is the one
  // seller's sentence for everybody. Two ways in (D147): the customer is his,
  // or the job is one he was put on —
  // the same sentence `requestQuotationAction` guards itself with.
  // And the coordinator, for whoever works it (SPEC §3 P13): the dialog's "For"
  // field offers the people who may raise on this job.
  const mayRaise =
    mayRaiseFor(user, project.company.repId, project.repId, project.onProject) ||
    raisesOnBehalf(user);
  // She does not ask the desk for a price; she IS the desk (SPEC §3), so the
  // same door says Issue and the form behind it asks for the SMAC number.
  const direct = issuesOwnQuotations(user.role);

  const requestTrigger = project.lostAt || !mayRaise ? null : (
    <RequestQuotationDialog
      companyId={project.companyId}
      projectId={project.id}
      projectName={project.name}
      issuesDirectly={direct}
      trigger={
        <Button variant="outline">
          {t(direct ? "quotations.issueOwn" : "quotations.request")}
        </Button>
      }
    />
  );

  // The sheet's Add report and the Correct on every history entry open the one
  // popup the top bar mounts for the whole app (D82).
  return (
    <ProjectSheet
      projectId={project.id}
      name={project.name}
      companyId={project.companyId}
      companyName={project.companyName}
      cityName={project.company.cityName}
      expectedSqm={project.expectedSqm}
      stage={project.stage}
      standing={standing}
      nextFollowUp={project.nextFollowUp}
      followUpState={project.followUpState}
      lostOn={toDay(project.lostAt)}
      lostReason={project.lostReason}
      notes={project.notes}
      mine={mine}
      reports={reports}
      owns={owns}
      // Who else is on it, in words for every reader; Sharing, in the sheet's
      // menu, is offered to whoever grants a share or is on one (D147).
      sharers={sharers}
      shareWith={shareWith}
      me={user.id}
      // The request button is in ONE position, whatever the list under it says.
      // Rendered inside the empty branch it was destroyed by the save that
      // filled the list, and the dialog's success handler — the toast, and the
      // jump to the quotation just raised — went with it (D35).
      quotations={
        <div className="flex flex-col gap-3">
          {requestTrigger ? <div className="flex">{requestTrigger}</div> : null}
          {quotations.length === 0 ? (
            <Empty size="panel">{t("quotations.emptyForProject")}</Empty>
          ) : (
            <QuotationMiniList rows={quotations} />
          )}
        </div>
      }
      // Add report is in the drawer's action row above and never moves, so the
      // empty panel carries the sentence alone (D31, D35).
      activity={
        <ActivityList
          activities={project.activities}
          // The same corrections as the company drawer, on the same entries
          // (D70). The project is preselected because that is where he is.
          correct
          empty={<Empty size="panel">{t("projects.emptyActivity")}</Empty>}
        />
      }
    />
  );
}
