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
import { formatDay } from "@/lib/dates";
import { NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { LEAD_LATE_WORKING_DAYS } from "@/lib/leads";
import type { StateTone } from "@/lib/state-tone";
import type { Stuck } from "@/lib/team";

/**
 * What is waiting longer than it should be (SPEC D14).
 *
 * Seven questions, each with its own window: two records that hold one
 * telephone number and are waiting on him to say whether they are one customer
 * (P12-8), work due today on the floor of somebody who is on leave (D75), a
 * lead marketing handed somebody and nobody has picked up (§3, P12-7), a
 * quotation request more than two WORKING days on the coordinator's desk, a
 * follow-up more than three days past its date, a company added more than
 * fourteen days ago and never contacted, and a customer somebody DID contact and
 * then dropped — no next step anywhere on him and nothing logged for a fortnight
 * (D63). The last is the biggest and was invisible until P9.4: it is on no band
 * of any screen, because every band this app had was keyed on a date and these
 * have none.
 *
 * The duplicates are first because they are the only rows here that are the
 * MANAGER's own work rather than somebody else's that he is watching, and the
 * only ones he can finish from where he is standing. Every other group asks him
 * to ring somebody. The uncovered are next, because they are the only ones about
 * TODAY. The lead is third: the youngest kind of stuck and the cheapest to clear.
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
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const nothing =
    stuck.duplicates.total === 0 &&
    stuck.uncovered.total === 0 &&
    stuck.leads.total === 0 &&
    stuck.requests.total === 0 &&
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

  const requests: StuckRowData[] = stuck.requests.rows.map((row) => ({
    key: row.id,
    href: `/quotations?open=${row.id}`,
    label: row.label,
    companyName: row.companyName,
    face: face(row.id, row.companyName),
    who: row.repName,
    people: people(row.id, [row.repName]),
    note: t("team.waitingDays", { count: row.workingDaysWaiting }),
    noteTone: "bad",
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
    // First, because it is the only group here he can finish himself.
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
      tone: "bad" as const,
      rows: requests,
      more: stuck.requests.total - requests.length,
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

  // A card is as tall as its title, its rule, its rows and its tail line.
  const split = splitByLength(
    groups.map((group) => 1 + (group.means ? 1 : 0) + group.rows.length * 1.5 + (group.more > 0 ? 1 : 0)),
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
