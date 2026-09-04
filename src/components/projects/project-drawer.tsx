import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/activities/activity-list";
import { LogDialog } from "@/components/activities/log-dialog";
import { ProjectSheet } from "@/components/projects/projects-table";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { NotAllowed, requireUser } from "@/lib/authz";
import { getCompany } from "@/lib/companies";
import { dayOf } from "@/lib/dates";
import { getProject } from "@/lib/projects";

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

  return (
    <ProjectSheet
      projectId={project.id}
      name={project.name}
      companyId={project.companyId}
      companyName={project.companyName}
      cityName={project.company.cityName}
      expectedSqm={project.expectedSqm}
      nextFollowUp={project.nextFollowUp}
      followUpState={project.followUpState}
      lostOn={toDay(project.lostAt)}
      lostReason={project.lostReason}
      notes={project.notes}
      contacts={contacts}
      projects={projects}
      activity={
        <ActivityList
          activities={project.activities}
          // One sentence and its primary action, and the action works (SPEC §3).
          empty={
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="max-w-prose text-sm text-muted-foreground">
                {t("projects.emptyActivity")}
              </p>
              <LogDialog
                companyId={project.companyId}
                companyName={project.companyName}
                projectId={project.id}
                contacts={contacts}
                projects={projects}
                trigger={<Button variant="outline">{t("common.log")}</Button>}
              />
            </div>
          }
        />
      }
    />
  );
}
