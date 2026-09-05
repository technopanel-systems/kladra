import { getLocale, getTranslations } from "next-intl/server";
import { StuckRows, type StuckRowData } from "@/components/team/stuck-rows";
import { formatDay } from "@/lib/dates";
import { NEVER_CONTACTED_DAYS } from "@/lib/followups";
import type { Stuck } from "@/lib/team";

/**
 * What is waiting longer than it should be (SPEC D14).
 *
 * Five questions, each with its own window: work due today on the floor of
 * somebody who is on leave (D75), a quotation request more than two WORKING days
 * on the coordinator's desk, a follow-up more than three days past its date, a
 * company added more than fourteen days ago and never contacted, and a customer
 * somebody DID contact and then dropped — no next step anywhere on him and
 * nothing logged for a fortnight (D63). The fourth is the biggest and was
 * invisible until P9.4: it is on no band of any screen, because every band this
 * app had was keyed on a date and these have none.
 *
 * The first is the only one about TODAY, so it is first on the screen. The rest
 * have been waiting for days and will still be there tomorrow; a customer
 * expecting a call this morning from a rep who is not at work will not.
 *
 * Working days for the first one because a request raised on a Thursday is not
 * late on Sunday, and a rep back from Eid must not be told he is behind (S48).
 *
 * Every row goes somewhere. A list of problems nobody can act on from is a list
 * people stop reading (S52 — a reminder is cleared by doing the work).
 *
 * Empty is the good state and says so, rather than showing three empty
 * headings, which reads as a screen that failed to load.
 *
 * This file decides what each row SAYS; `StuckRows` draws them, on the client,
 * from that data (D82).
 */
export async function StuckList({ stuck }: { stuck: Stuck }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const nothing =
    stuck.uncovered.total === 0 &&
    stuck.requests.total === 0 &&
    stuck.followUps.total === 0 &&
    stuck.neverContacted.total === 0 &&
    stuck.goneQuiet.total === 0;

  if (nothing) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.stuck")}</h2>
        <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
          {t("team.stuckNothing")}
        </p>
      </section>
    );
  }

  /** A company row points at the company; a project row at its project. */
  const hrefOf = (row: { kind: "company" | "project"; id: string }) =>
    row.kind === "company" ? `/companies?open=${row.id}` : `/projects?open=${row.id}`;

  const uncovered: StuckRowData[] = stuck.uncovered.rows.map((row) => ({
    key: `away-${row.kind}-${row.id}`,
    href: hrefOf(row),
    name: row.name,
    companyName: row.kind === "company" ? undefined : row.companyName,
    who: t("team.awayBackOn", {
      name: row.repName,
      day: formatDay(row.backOn, locale),
    }),
    note:
      row.daysOverdue > 0
        ? t("team.overdueDays", { count: row.daysOverdue })
        : t("common.dueToday"),
  }));

  const requests: StuckRowData[] = stuck.requests.rows.map((row) => ({
    key: row.id,
    href: `/quotations?open=${row.id}`,
    label: row.label,
    companyName: row.companyName,
    who: row.repName,
    note: t("team.waitingDays", { count: row.workingDaysWaiting }),
  }));

  const followUps: StuckRowData[] = stuck.followUps.rows.map((row) => ({
    key: `${row.kind}-${row.id}`,
    href: hrefOf(row),
    name: row.name,
    companyName: row.kind === "company" ? undefined : row.companyName,
    who: row.repName,
    day: row.day,
    note: t("team.overdueDays", { count: row.daysOverdue }),
  }));

  const goneQuiet: StuckRowData[] = stuck.goneQuiet.rows.map((row) => ({
    key: row.id,
    href: `/companies?open=${row.id}`,
    name: row.name,
    who: row.repName,
    note: t("team.quietDays", { count: row.days }),
  }));

  const neverContacted: StuckRowData[] = stuck.neverContacted.rows.map((row) => ({
    key: row.id,
    href: `/companies?open=${row.id}`,
    name: row.name,
    who: row.repName,
    note: t("team.addedDays", { count: row.days }),
  }));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">{t("team.stuck")}</h2>

      {/* First, because it is the only group here about TODAY: a customer
          expecting a call this morning from somebody who is on leave. The rest
          have been waiting days and will still be waiting tomorrow. */}
      {stuck.uncovered.total > 0 ? (
        <Group
          title={t("team.uncovered")}
          means={t("team.uncoveredMeans")}
          rows={uncovered}
          more={stuck.uncovered.total - uncovered.length}
        />
      ) : null}

      {stuck.requests.total > 0 ? (
        <Group
          title={t("team.stuckRequests")}
          rows={requests}
          more={stuck.requests.total - requests.length}
        />
      ) : null}

      {stuck.followUps.total > 0 ? (
        <Group
          title={t("team.stuckFollowUps")}
          rows={followUps}
          more={stuck.followUps.total - followUps.length}
        />
      ) : null}

      {stuck.goneQuiet.total > 0 ? (
        <Group
          title={t("team.stuckQuiet")}
          means={t("common.quietMeans", { days: NEVER_CONTACTED_DAYS })}
          rows={goneQuiet}
          more={stuck.goneQuiet.total - goneQuiet.length}
        />
      ) : null}

      {stuck.neverContacted.total > 0 ? (
        <Group
          title={t("team.stuckNever")}
          rows={neverContacted}
          more={stuck.neverContacted.total - neverContacted.length}
        />
      ) : null}
    </section>
  );
}

async function Group({
  title,
  means,
  rows,
  more,
}: {
  title: string;
  /** The rule behind the group, where its name does not carry it (D59). */
  means?: string;
  rows: StuckRowData[];
  /** How many are not drawn, when the group is longer than a screen (D80). */
  more: number;
}) {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-xs font-medium text-faint">{title}</h3>
        {means ? <p className="text-xs text-muted-foreground">{means}</p> : null}
      </div>
      <StuckRows rows={rows} />
      {/* Said rather than silently dropped. Forty companies nobody has
          contacted is a real floor, and a list that shows twenty of them and
          says nothing is a screen that has decided for the reader (D80). */}
      {more > 0 ? (
        <p className="text-xs text-faint">{t("common.andMore", { count: more })}</p>
      ) : null}
    </div>
  );
}
