import { getLocale, getTranslations } from "next-intl/server";
import { stuckFaces, type StuckFace } from "@/components/team/stuck-faces";
import { StuckRows, type StuckRowData } from "@/components/team/stuck-rows";
import {
  WORK_CARD,
  WorkGrid,
  WorkTitle,
  splitByLength,
} from "@/components/team/work-grid";
import { Empty } from "@/components/ui-ext/empty";
import { requireUser } from "@/lib/authz";
import { formatDay } from "@/lib/dates";
import { answersArchiveRequests } from "@/lib/floor";
import { NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { LEAD_LATE_WORKING_DAYS } from "@/lib/leads";
import type { StateTone } from "@/lib/state-tone";
import type { ArchiveKind } from "@/db/schema";
import { STUCK_REQUEST_WORKING_DAYS, type Stuck } from "@/lib/team";

/**
 * What is waiting longer than it should be (SPEC D14).
 *
 * Eight questions, each with its own window: two records that hold one
 * telephone number and are waiting on him to say whether they are one customer
 * (P12-8), work due today on the floor of somebody who is on leave (D75), a
 * lead marketing handed somebody and nobody has picked up (§3, P12-7), a
 * request on the coordinator's desk — a quotation to issue or a load to
 * approve, from the morning it is raised (P14, 14B) — a request to take a
 * record off the floor, waiting on his yes or no (P14 14.8), a
 * follow-up more than three days past its date, a company added more than
 * fourteen days ago and never contacted, and a customer somebody DID contact and
 * then dropped — no next step anywhere on him and nothing logged for a fortnight
 * (D63). The last is the biggest and was invisible until P9.4: it is on no band
 * of any screen, because every band this app had was keyed on a date and these
 * have none.
 *
 * **Two of the eight are HIS OWN work** rather than somebody else's that he is
 * watching: the duplicates and the requests to archive. Nobody else can answer
 * either, and he can finish both from where he is standing — every other group
 * asks him to ring somebody. The duplicates are first because they are also the
 * oldest question on the screen; the uncovered are next, because they are the
 * only ones about TODAY. The lead is third: the youngest kind of stuck and the
 * cheapest to clear.
 *
 * Working days for the first ones because a request raised on a Thursday is not
 * late on Sunday, and a rep back from Eid must not be told he is behind (S48).
 *
 * Every row goes somewhere. A list of problems nobody can act on from is a list
 * people stop reading (S52 — a reminder is cleared by doing the work).
 *
 * **Faces, dots and two stacks** (P13-G6 S12.7). Each row leads with its
 * company's face and names its person beside his (`stuck-faces.ts`), with a dot
 * only where §1b gives one — a company with an overdue follow-up, a lead nobody
 * has acknowledged, a rep on leave. Each card's title carries its group's tone
 * as a dot and never as its colour. And the cards are two stacks split where
 * their lengths come out nearest, in the order below: three peers across a desk
 * started the second row under the longest card and left the short ones
 * standing over nothing.
 *
 * Empty is the good state and says so, rather than showing seven empty
 * headings, which reads as a screen that failed to load.
 *
 * This file decides what each row SAYS; `StuckRows` draws them, on the client,
 * from that data (D82).
 */
export async function StuckList({ stuck }: { stuck: Stuck }) {
  const [t, locale, user] = await Promise.all([getTranslations(), getLocale(), requireUser()]);

  /*
   * Every group, counted. It listed seven of the eight — the requests to
   * archive were added beside the others and never added here — so a morning
   * whose only waiting work was a request to archive drew "Nothing is stuck"
   * over a band the screen then did not draw at all. The one group that is the
   * manager's own was the one the empty test could not see.
   */
  const nothing =
    stuck.duplicates.total === 0 &&
    stuck.uncovered.total === 0 &&
    stuck.leads.total === 0 &&
    stuck.requests.total === 0 &&
    stuck.archives.total === 0 &&
    stuck.followUps.total === 0 &&
    stuck.neverContacted.total === 0 &&
    stuck.goneQuiet.total === 0;

  if (nothing) {
    return (
      <section className="flex flex-col gap-3">
        <WorkTitle as="h2">{t("team.stuck")}</WorkTitle>
        <Empty size="panel">{t("team.stuckNothing")}</Empty>
      </section>
    );
  }

  const faces = await stuckFaces(stuck);

  /**
   * The faces a row wears. A row whose company went between the two reads keeps
   * its words and wears the name's own face for one render rather than none: the
   * next live update draws it without the row.
   */
  const face = (key: string, name: string, ring?: StateTone) => {
    const found: StuckFace | undefined = faces.get(key);
    return { id: found?.companyId ?? key, name, ring };
  };
  const people = (key: string, names: string[], ring?: StateTone) => {
    const ids = faces.get(key)?.people ?? [];
    return names.map((name, index) => ({ id: ids[index] ?? `${key}-${index}`, name, ring }));
  };

  /** A company row points at the company; a project row at its project. */
  const hrefOf = (row: { kind: "company" | "project"; id: string }) =>
    row.kind === "company" ? `/companies?open=${row.id}` : `/projects?open=${row.id}`;

  /**
   * And a request to archive points at the record it is about, which is where
   * he answers it. A contact has no drawer of its own: it is a card inside its
   * customer's, so that is where the row goes (P14 14.8).
   */
  const hrefOfArchive = (row: { kind: ArchiveKind; recordId: string; companyId: string }) =>
    row.kind === "project"
      ? `/projects?open=${row.recordId}`
      : `/companies?open=${row.companyId}`;

  // Whether this reader ANSWERS a request to archive, which is the one act this
  // screen offers rather than points at. `answersArchiveRequests` is the same
  // sentence the action decides by, and it says no to an admin looking through
  // the manager's eyes (D42, P8.8): he reads the band and presses nothing.
  const answers = answersArchiveRequests(user);

  /*
   * The customer as the arriving record spells him, and the two people holding
   * a record each. Both names go through one message with two placeholders
   * rather than being joined here: the loader isolates each one, so an Arabic
   * name beside a Latin one keeps its own direction (rules/words.md).
   *
   * Every row goes to the same screen, which is the one place the pair can
   * actually be read side by side and answered.
   */
  const duplicates: StuckRowData[] = stuck.duplicates.rows.map((row) => ({
    key: row.id,
    href: "/duplicates",
    name: row.name,
    face: face(row.id, row.name),
    who: t("duplicates.between", { a: row.older, b: row.newer }),
    people: people(row.id, [row.older, row.newer]),
    note: t("team.waitingDays", { count: row.waited.days }),
    noteTone: "wait",
  }));

  // A rep on leave wears the leave dot (DESIGN §1b), and the words beside him
  // say the day he is back. A call past its day is a company's overdue dot.
  const uncovered: StuckRowData[] = stuck.uncovered.rows.map((row) => ({
    key: `away-${row.kind}-${row.id}`,
    href: hrefOf(row),
    name: row.name,
    companyName: row.kind === "company" ? undefined : row.companyName,
    face: face(row.id, row.companyName, row.daysOverdue > 0 ? "bad" : undefined),
    who: t("team.awayBackOn", {
      name: row.repName,
      day: formatDay(row.backOn, locale),
    }),
    people: people(row.id, [row.repName], "over"),
    note:
      row.daysOverdue > 0
        ? t("team.overdueDays", { count: row.daysOverdue })
        : t("common.dueToday"),
    noteTone: row.daysOverdue > 0 ? "bad" : "wait",
  }));

  /*
   * The customer, whose floor he is sitting on, and how long. Who FOUND him is
   * not on the row: the manager reading this is deciding whether to ring the
   * rep, and marketing has already done its half — its own screen is where the
   * finder's name belongs (P12-7).
   */
  const leads: StuckRowData[] = stuck.leads.rows.map((row) => ({
    key: row.id,
    href: `/companies?open=${row.id}`,
    name: row.name,
    face: face(row.id, row.name, "wait"),
    who: row.repName,
    people: people(row.id, [row.repName]),
    // The same words a waiting request wears two groups down: it is the same
    // question — how long has this been sitting — and one phrasing for one
    // figure is what keeps the manager from reading two clocks (D59).
    note: t("team.waitingDays", { count: row.waited?.days ?? 0 }),
    noteTone: "wait",
  }));

  /*
   * Everything on the coordinator's desk, from the morning it is raised (P14,
   * 14B), quotations and loads in one list oldest first: the manager asked for
   * the requests waiting, and until now he was shown only the ones that had sat
   * two working days, which on a desk cleared the same day is an empty group
   * under a heading promising the opposite.
   *
   * The two-day line is still drawn, in the one place it means something: a row
   * past it is red, a row inside it amber, both saying how long in the same
   * words. One clock, two states of it (D59).
   */
  const requests: StuckRowData[] = stuck.requests.rows.map((row) => ({
    key: `${row.kind}-${row.id}`,
    href: row.kind === "quotation" ? `/quotations?open=${row.id}` : `/dispatches?open=${row.id}`,
    label: row.label,
    companyName: row.companyName,
    face: face(row.id, row.companyName),
    who: row.repName,
    people: people(row.id, [row.repName]),
    note: t("team.waitingDays", { count: row.workingDaysWaiting }),
    noteTone: row.late ? "bad" : "wait",
  }));

  /*
   * His own desk — one of the two bands on this screen that is (P14 14.8, and
   * the duplicates above are the other). Most groups here are somebody else's
   * work that he is watching; these are requests waiting on him to say yes or
   * no.
   *
   * The face is the customer's, as it is on every row of this screen, and the
   * first line names the record itself — the person or the job where it is not
   * the customer, so "archive Prime Facade" and "archive Ahmed at Prime Facade"
   * do not read alike. Who asked, not whose floor it is: this is the one row
   * here where those can differ and the asker is the one he answers.
   *
   * **The reason is on the row, and so are the two answers** (M2). The decision
   * is "archive X because Y: yes or no", and the row held Y all along and drew
   * only X — so the one band he can finish from where he is standing sent him
   * to the record to read a sentence it already had, and for a contact it
   * landed him on the drawer's Reports tab with the notice inside the Contacts
   * one. The row stays a door as well: the rest of the customer is where he
   * goes when the reason alone does not settle it.
   */
  const archives: StuckRowData[] = stuck.archives.rows.map((row) => ({
    key: row.id,
    href: hrefOfArchive(row),
    name: row.name,
    companyName: row.kind === "company" ? undefined : row.companyName,
    face: face(row.companyId, row.companyName, "wait"),
    who: row.askedBy,
    people: people(row.id, [row.askedBy]),
    // The same words the waiting requests two cards up wear: one clock, one
    // phrasing, so a manager reading both is not reading two (D59).
    note: t("team.waitingDays", { count: row.workingDaysWaiting }),
    noteTone: "wait",
    reason: row.reason,
    answer: answers ? { requestId: row.id, name: row.name } : undefined,
  }));

  const followUps: StuckRowData[] = stuck.followUps.rows.map((row) => ({
    key: `${row.kind}-${row.id}`,
    href: hrefOf(row),
    name: row.name,
    companyName: row.kind === "company" ? undefined : row.companyName,
    face: face(row.id, row.companyName, "bad"),
    who: row.repName,
    people: people(row.id, [row.repName]),
    day: row.day,
    note: t("team.overdueDays", { count: row.daysOverdue }),
    noteTone: "bad",
  }));

  // Silence, counted in calendar days: it carries no blame, so its note is not
  // coloured as lateness is (D141).
  const goneQuiet: StuckRowData[] = stuck.goneQuiet.rows.map((row) => ({
    key: row.id,
    href: `/companies?open=${row.id}`,
    name: row.name,
    face: face(row.id, row.name),
    who: row.repName,
    people: people(row.id, [row.repName]),
    note: t("team.quietDays", { count: row.days }),
  }));

  const neverContacted: StuckRowData[] = stuck.neverContacted.rows.map((row) => ({
    key: row.id,
    href: `/companies?open=${row.id}`,
    name: row.name,
    face: face(row.id, row.name),
    who: row.repName,
    people: people(row.id, [row.repName]),
    note: t("team.addedDays", { count: row.days }),
  }));

  /*
   * The groups in the order they should be cleared in, which is the order the
   * two stacks keep: the first stack holds the first groups, the second the
   * rest, so the Tab key and a phone walk them in this order too.
   */
  const groups = [
    // First, because it is his own work and the oldest question on the screen:
    // until he rules a pair, two reps are ringing one customer and neither
    // knows. The archive band below is the other group he finishes himself.
    stuck.duplicates.total > 0 && {
      key: "duplicates",
      title: t("duplicates.title"),
      tone: "wait" as const,
      means: t("duplicates.means"),
      rows: duplicates,
      more: stuck.duplicates.total - duplicates.length,
    },
    // Then the only group about TODAY: a customer expecting a call this morning
    // from somebody who is on leave.
    stuck.uncovered.total > 0 && {
      key: "uncovered",
      title: t("team.uncovered"),
      tone: "wait" as const,
      means: t("team.uncoveredMeans"),
      rows: uncovered,
      more: stuck.uncovered.total - uncovered.length,
    },
    stuck.leads.total > 0 && {
      key: "leads",
      title: t("team.stuckLeads"),
      tone: "wait" as const,
      means: t("team.stuckLeadsMeans", { days: LEAD_LATE_WORKING_DAYS }),
      rows: leads,
      more: stuck.leads.total - leads.length,
    },
    stuck.requests.total > 0 && {
      key: "requests",
      title: t("team.stuckRequests"),
      // The card's dot is red only where something on it is actually late: a
      // desk with this morning's work on it is waiting, not failing.
      tone: stuck.lateRequests > 0 ? ("bad" as const) : ("wait" as const),
      means: t("team.stuckRequestsGroupMeans", { days: STUCK_REQUEST_WORKING_DAYS }),
      rows: requests,
      more: stuck.requests.total - requests.length,
    },
    stuck.archives.total > 0 && {
      key: "archives",
      title: t("team.archiveAsks"),
      tone: "wait" as const,
      means: t("team.archiveAsksMeans"),
      rows: archives,
      more: stuck.archives.total - archives.length,
    },
    stuck.followUps.total > 0 && {
      key: "followUps",
      title: t("team.stuckFollowUps"),
      tone: "bad" as const,
      rows: followUps,
      more: stuck.followUps.total - followUps.length,
    },
    stuck.goneQuiet.total > 0 && {
      key: "goneQuiet",
      title: t("team.stuckQuiet"),
      tone: "open" as const,
      means: t("common.quietMeans", { days: NEVER_CONTACTED_DAYS }),
      rows: goneQuiet,
      more: stuck.goneQuiet.total - goneQuiet.length,
    },
    stuck.neverContacted.total > 0 && {
      key: "neverContacted",
      title: t("team.stuckNever"),
      tone: "open" as const,
      rows: neverContacted,
      more: stuck.neverContacted.total - neverContacted.length,
    },
  ].filter((group) => group !== false);

  /*
   * A card is as tall as its title, its rule, its rows and its tail line — and
   * a row is not one height any more. An archive row carries the asker's reason
   * under it and two buttons under that (M2), so a band of four of them is
   * nearer nine rows than six, and a split that counted them as six put the two
   * stacks a card's height apart.
   */
  const rowHeight = (row: StuckRowData) =>
    1.5 + (row.reason ? 0.75 : 0) + (row.answer ? 1.25 : 0);
  const split = splitByLength(
    groups.map(
      (group) =>
        1 +
        (group.means ? 1 : 0) +
        group.rows.reduce((tall, row) => tall + rowHeight(row), 0) +
        (group.more > 0 ? 1 : 0),
    ),
  );
  const cards = groups.map((group) => (
    <Group
      key={group.key}
      title={group.title}
      tone={group.tone}
      means={group.means}
      rows={group.rows}
      more={group.more}
    />
  ));

  return (
    <section className="flex flex-col gap-3">
      <WorkTitle as="h2">{t("team.stuck")}</WorkTitle>
      <WorkGrid start={cards.slice(0, split)} end={cards.slice(split)} />
    </section>
  );
}

async function Group({
  title,
  tone,
  means,
  rows,
  more,
}: {
  title: string;
  tone: StateTone;
  /** The rule behind the group, where its name does not carry it (D59). */
  means?: string;
  rows: StuckRowData[];
  /** How many are not drawn, when the group is longer than a screen (D80). */
  more: number;
}) {
  const t = await getTranslations();

  return (
    <section className={WORK_CARD}>
      <div className="flex flex-col gap-0.5">
        <WorkTitle tone={tone} count={rows.length + more}>
          {title}
        </WorkTitle>
        {means ? <p className="ps-4 text-xs text-muted-foreground">{means}</p> : null}
      </div>
      <StuckRows rows={rows} />
      {/* Said rather than silently dropped. Forty companies nobody has
          contacted is a real floor, and a list that shows twenty of them and
          says nothing is a screen that has decided for the reader (D80). */}
      {more > 0 ? (
        <p className="text-xs text-faint">{t("common.andMore", { count: more })}</p>
      ) : null}
    </section>
  );
}
