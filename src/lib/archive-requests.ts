/**
 * Asking to take a record off the floor, and the answer (SPEC §3, P14 14.8).
 *
 * The founder, after a third round of use: "A company, a project or anything
 * else archivable: whoever asks writes a mandatory reason, the request goes to
 * the manager, and he approves or refuses it. A refusal comes back carrying his
 * reason, exactly as a refused dispatch does, and it can be corrected and asked
 * again. His own archives happen at once. Pending requests sit in the awaiting
 * section of his dashboard. One approval path for everything archivable, not
 * one per kind of record."
 *
 * One path is what this file is. The three archive actions each own their own
 * record — what "archived" means to a contact is not what it means to a company
 * — but not one of them owns the QUESTION, and three copies of it would be
 * three chances for one kind to be archived without a reason, which is exactly
 * the state 14.8 exists to end: a company was asked why and a contact and a
 * project were not.
 *
 * Every archive writes a row here, including the manager's own and the admin's,
 * which go in already approved in the same transaction as the archive itself.
 * That is not ceremony: it is what makes the reason universal, and it means the
 * archive screen can ask one table why any record went, rather than reading
 * `companies.archive_reason` for one kind out of three.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  archiveRequests,
  companies,
  contacts,
  projects,
  users,
  type ArchiveKind,
  type ArchiveRequestStatus,
} from "@/db/schema";
import type { Day } from "@/lib/dates";
import { archiveLink, archiveRecord, holdArchivable } from "@/lib/archive";
import { ARCHIVE_ANSWER_ROLES, answersArchiveRequests } from "@/lib/floor";
import { liveAudienceForCompany, notifyLive } from "@/lib/live";
import { clearNotifications, createNotification } from "@/lib/notify";
import type { SessionUser } from "@/lib/types";
import { personNameOf } from "@/lib/people";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The database, or the transaction a write is already inside — a read that
 * belongs to a write must see what that write has done (D85).
 */
type Reader = Pick<typeof db, "select">;

const asker = alias(users, "archive_asker");
const decider = alias(users, "archive_decider");

/** Where a record's archiving stands, as its own drawer says it. */
export type ArchiveRequestState = {
  id: string;
  status: ArchiveRequestStatus;
  /** Why it should go, as whoever asked wrote it. Never blank. */
  reason: string;
  askedBy: string;
  askedById: string;
  askedOn: Day;
  /** His reason for refusing, and only a refusal has one. */
  refuseReason: string | null;
  /** Who answered, where anybody has, and the day the answer came. */
  decidedBy: string | null;
  decidedOn: Day | null;
};

/** One request on the manager's desk, with the record it is about. */
export type ArchiveAsk = {
  /** The request, not the record: this is what is answered. */
  id: string;
  kind: ArchiveKind;
  recordId: string;
  /** The record's own name — the customer, the person, or the job. */
  name: string;
  /** The customer it is on; for a company, itself. */
  companyId: string;
  companyName: string;
  /** Whose record it is, which is not always who asked. */
  repName: string;
  askedBy: string;
  askedOn: Day;
  reason: string;
};

/** The Riyadh day a request was written, as a Day. */
const askedOn = sql<Day>`to_char((${archiveRequests.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`;

/** And the day it was answered, which is null while it is waiting. */
const decidedOn = sql<
  Day | null
>`to_char((${archiveRequests.decidedAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`;

/**
 * Where this record's archiving stands, or null if nobody has ever asked.
 *
 * The NEWEST request and not the waiting one, because a refusal is a state the
 * drawer has to show: it carries the manager's reason and the rep's next move
 * (ask again with a better one), and a drawer that showed nothing would leave
 * him wondering whether anybody ever answered.
 */
export async function archiveStandsAt(
  kind: ArchiveKind,
  recordId: string,
  locale: string,
  exec: Reader = db,
): Promise<ArchiveRequestState | null> {
  const [row] = await exec
    .select({
      id: archiveRequests.id,
      status: archiveRequests.status,
      reason: archiveRequests.reason,
      askedById: archiveRequests.requestedBy,
      askedBy: personNameOf("archive_asker", locale),
      askedOn,
      refuseReason: archiveRequests.refuseReason,
      decidedBy: personNameOf("archive_decider", locale),
      decidedById: archiveRequests.decidedBy,
      decidedOn,
    })
    .from(archiveRequests)
    .innerJoin(asker, eq(asker.id, archiveRequests.requestedBy))
    .leftJoin(decider, eq(decider.id, archiveRequests.decidedBy))
    .where(and(eq(archiveRequests.kind, kind), eq(archiveRequests.recordId, recordId)))
    .orderBy(desc(archiveRequests.createdAt))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    askedBy: row.askedBy,
    askedById: row.askedById,
    askedOn: row.askedOn,
    refuseReason: row.refuseReason,
    // The name only where there is an id behind it: a left join hands back the
    // fallback half of `personNameOf` rather than null (D68).
    decidedBy: row.decidedById ? row.decidedBy : null,
    decidedOn: row.decidedOn,
  };
}

/**
 * The waiting request on this record, locked, or null.
 *
 * `for update` because the answer is a decision taken on what the row says now:
 * two managers reading the same waiting request and both answering it would
 * otherwise write one decision over the other, and the partial unique index
 * does not refuse that — it refuses two WAITING rows, and by then there is one
 * (rules/data.md: lock before deciding).
 */
export async function waitingArchiveRequest(
  tx: Tx,
  kind: ArchiveKind,
  recordId: string,
): Promise<{ id: string; requestedBy: string; reason: string } | null> {
  const [row] = await tx
    .select({
      id: archiveRequests.id,
      requestedBy: archiveRequests.requestedBy,
      reason: archiveRequests.reason,
    })
    .from(archiveRequests)
    .where(
      and(
        eq(archiveRequests.kind, kind),
        eq(archiveRequests.recordId, recordId),
        eq(archiveRequests.status, "waiting"),
      ),
    )
    .for("update")
    .limit(1);
  return row ?? null;
}

/** The request, by its own id, locked — the manager answered a row on a screen. */
export async function archiveRequestById(
  tx: Tx,
  id: string,
): Promise<{
  id: string;
  kind: ArchiveKind;
  recordId: string;
  requestedBy: string;
  reason: string;
  status: ArchiveRequestStatus;
} | null> {
  const [row] = await tx
    .select({
      id: archiveRequests.id,
      kind: archiveRequests.kind,
      recordId: archiveRequests.recordId,
      requestedBy: archiveRequests.requestedBy,
      reason: archiveRequests.reason,
      status: archiveRequests.status,
    })
    .from(archiveRequests)
    .where(eq(archiveRequests.id, id))
    .for("update")
    .limit(1);
  return row ?? null;
}

/**
 * Write the asking. Waiting when somebody has to answer it, already approved
 * when the person doing it is the person who would have answered.
 *
 * The already-approved row is why the archive screen can name a reason for
 * every record on it: the manager archiving something himself still says why,
 * and his sentence lands in the same column the rep's does.
 */
export async function writeArchiveRequest(
  tx: Tx,
  input: {
    kind: ArchiveKind;
    recordId: string;
    reason: string;
    actorId: string;
    /** Set when the archive is happening in this same transaction. */
    settled?: boolean;
  },
): Promise<string> {
  const [row] = await tx
    .insert(archiveRequests)
    .values({
      kind: input.kind,
      recordId: input.recordId,
      reason: input.reason,
      requestedBy: input.actorId,
      ...(input.settled
        ? { status: "approved" as const, decidedBy: input.actorId, decidedAt: new Date() }
        : {}),
    })
    .returning({ id: archiveRequests.id });
  return row.id;
}

/** Approve or refuse one. A refusal carries his reason; an approval carries none. */
export async function settleArchiveRequest(
  tx: Tx,
  input: { id: string; actorId: string; refuseReason?: string },
): Promise<void> {
  await tx
    .update(archiveRequests)
    .set({
      status: input.refuseReason === undefined ? "approved" : "refused",
      decidedBy: input.actorId,
      decidedAt: new Date(),
      refuseReason: input.refuseReason ?? null,
    })
    .where(and(eq(archiveRequests.id, input.id), eq(archiveRequests.status, "waiting")));
}

/**
 * Who is told when somebody asks — every active person who could answer it.
 *
 * The role list is `src/lib/floor.ts`'s, the same one the predicate reads, so
 * the people who are told and the people who may answer cannot come apart.
 */
export async function archiveAnswerers(exec: Reader = db): Promise<string[]> {
  const rows = await exec
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), inArray(users.role, ARCHIVE_ANSWER_ROLES)));
  return rows.map((row) => row.id);
}

/**
 * Everything waiting on the manager, oldest first.
 *
 * Its own group beside the quotations and loads rather than inside them: those
 * are the coordinator's desk and these are his, and one heading over two desks
 * is the defect where a manager reads a figure that is nobody's in particular
 * (rules/words.md, two figures with almost the same name).
 */
export async function waitingArchives(
  locale: string,
  limit: number,
): Promise<{ rows: ArchiveAsk[]; total: number }> {
  const person = personNameOf("who", locale);
  const owner = personNameOf("owner", locale);

  const rows = await db.execute<{
    id: string;
    kind: ArchiveKind;
    record_id: string;
    name: string;
    company_id: string;
    company_name: string;
    rep_name: string;
    asked_by: string;
    asked_on: Day;
    reason: string;
    total: number;
  }>(sql`
    select r.id::text as id, r.kind, r.record_id::text as record_id,
           asked.name, asked.company_id::text as company_id, asked.company_name,
           ${owner} as rep_name,
           ${person} as asked_by,
           to_char((r.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as asked_on,
           r.reason,
           -- How many there are in all, counted over the whole window before
           -- the limit cuts it: a figure above a list is never the length of
           -- the list (D144).
           (count(*) over ())::int as total
      from ${archiveRequests} r
      join ${users} who on who.id = r.requested_by
      join lateral (
        select c.name, c.id as company_id, c.name as company_name, c.rep_id
          from ${companies} c
         where r.kind = 'company' and c.id = r.record_id and c.archived_at is null
        union all
        select ct.name, cc.id, cc.name, ct.rep_id
          from ${contacts} ct join ${companies} cc on cc.id = ct.company_id
         where r.kind = 'contact' and ct.id = r.record_id and ct.archived_at is null
        union all
        select pj.name, pc.id, pc.name, pj.rep_id
          from ${projects} pj join ${companies} pc on pc.id = pj.company_id
         where r.kind = 'project' and pj.id = r.record_id and pj.archived_at is null
      ) asked on true
      join ${users} owner on owner.id = asked.rep_id
     where r.status = 'waiting'
     order by r.created_at asc, asked.name
     limit ${limit}
  `);

  return {
    total: rows.rows[0]?.total ?? 0,
    rows: rows.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      recordId: row.record_id,
      name: row.name,
      companyId: row.company_id,
      companyName: row.company_name,
      repName: row.rep_name,
      askedBy: row.asked_by,
      askedOn: row.asked_on,
      reason: row.reason,
    })),
  };
}

/**
 * A record has gone off the floor by some other door — settle whatever was
 * waiting on it (P14 14.8).
 *
 * There is one other door and it is the fold: the manager rules two records one
 * customer, and the losing company is archived where it stands, with its people
 * moved or archived under it (P12-8). A request left waiting on a record that
 * no longer exists is a question nobody can answer: it drops off the band,
 * which reads only live records, and sits in the table for ever — and its
 * notice would sit in his bell pointing at a drawer where the buttons are gone
 * (D79). The outcome the request asked for is what happened, so it is approved,
 * by whoever did it.
 */
export async function settleWaitingFor(
  tx: Tx,
  kind: ArchiveKind,
  recordId: string,
  actorId: string,
): Promise<void> {
  const waiting = await waitingArchiveRequest(tx, kind, recordId);
  if (!waiting) return;
  await settleArchiveRequest(tx, { id: waiting.id, actorId });
  await clearNotifications(tx, { type: kind, id: recordId }, ["archiveRequested"]);
}

/** What became of an attempt to archive something. */
export type AskOutcome = "archived" | "asked" | "waiting" | "gone";

/**
 * Archive it, or ask for it — one door, because the person pressing the button
 * should not have to know which of the two he is doing (SPEC §3, P14 14.8).
 *
 * The gate above this decides whether the record is his to archive at all; this
 * decides what pressing it MEANS, and the two answers differ only in who writes
 * the record's `archived_at`. A rep's press files a request and tells whoever
 * can answer it. The manager's press is the answer and the act together.
 */
export async function archiveOrAsk(input: {
  kind: ArchiveKind;
  recordId: string;
  reason: string;
  actor: SessionUser;
}): Promise<AskOutcome> {
  const atOnce = answersArchiveRequests(input.actor);

  return db.transaction(async (tx) => {
    const record = await holdArchivable(tx, input.kind, input.recordId);
    if (!record) return "gone";

    const waiting = await waitingArchiveRequest(tx, input.kind, input.recordId);

    if (!atOnce) {
      // One waiting request per record is the index's rule; this is the same
      // sentence said in the app's words, before the database says it in
      // Postgres's (D132).
      if (waiting) return "waiting";

      await writeArchiveRequest(tx, {
        kind: input.kind,
        recordId: input.recordId,
        reason: input.reason,
        actorId: input.actor.id,
      });

      const link = archiveLink(record);
      for (const userId of await archiveAnswerers(tx)) {
        if (userId === input.actor.id) continue;
        await createNotification(tx, {
          userId,
          kind: "archiveRequested",
          // The name of the record and the id of the person, never his name:
          // the sentence is built in the reader's language at read time (D13).
          params: { label: record.name, repId: input.actor.id },
          link,
          subject: { type: input.kind, id: record.id },
        });
      }

      await notifyLive(tx, await liveAudienceForCompany(record.companyId, input.actor.id), {
        type: "company",
        id: record.companyId,
      });
      return "asked";
    }

    await archiveRecord(tx, record, input.reason, input.actor.id);

    if (waiting) {
      // Somebody had asked, and he has just done it: that is an approval, and
      // the request cannot be left waiting for a record that has gone.
      await settleArchiveRequest(tx, { id: waiting.id, actorId: input.actor.id });
      await clearNotifications(tx, { type: input.kind, id: record.id }, ["archiveRequested"]);
      if (waiting.requestedBy !== input.actor.id) {
        await createNotification(tx, {
          userId: waiting.requestedBy,
          kind: "archiveApproved",
          params: { label: record.name, repId: input.actor.id },
          link: archiveLink(record),
          subject: { type: input.kind, id: record.id },
        });
      }
    } else {
      await writeArchiveRequest(tx, {
        kind: input.kind,
        recordId: input.recordId,
        reason: input.reason,
        actorId: input.actor.id,
        settled: true,
      });
    }
    return "archived";
  });
}

/** What became of an answer to a request. */
export type AnswerOutcome = "approved" | "refused" | "answered" | "gone";

/**
 * The manager's answer: approve it, and the record goes; refuse it, and his
 * reason goes back to whoever asked (S53).
 *
 * A refusal is not the end of it. The refused row keeps his sentence and the
 * rep asks again with a better one, which is a NEW row — so the history reads
 * as what happened rather than as whatever was typed last (D88's rule for a
 * correction, one record further out).
 */
export async function answerArchiveRequest(input: {
  id: string;
  actor: SessionUser;
  refuseReason?: string;
}): Promise<AnswerOutcome> {
  return db.transaction(async (tx) => {
    const request = await archiveRequestById(tx, input.id);
    if (!request) return "gone";
    // Somebody answered it while this screen was open (D85).
    if (request.status !== "waiting") return "answered";

    const record = await holdArchivable(tx, request.kind, request.recordId);
    if (!record) {
      // It has already gone, by some other door. The request asked for exactly
      // that, so it is settled rather than left waiting for ever.
      await settleArchiveRequest(tx, { id: request.id, actorId: input.actor.id });
      await clearNotifications(tx, { type: request.kind, id: request.recordId }, [
        "archiveRequested",
      ]);
      return "gone";
    }

    const refusing = input.refuseReason !== undefined;
    if (!refusing) await archiveRecord(tx, record, request.reason, input.actor.id);

    await settleArchiveRequest(tx, {
      id: request.id,
      actorId: input.actor.id,
      refuseReason: input.refuseReason,
    });
    await clearNotifications(tx, { type: request.kind, id: record.id }, ["archiveRequested"]);

    if (request.requestedBy !== input.actor.id) {
      await createNotification(tx, {
        userId: request.requestedBy,
        kind: refusing ? "archiveRefused" : "archiveApproved",
        params: { label: record.name, repId: input.actor.id },
        link: archiveLink(record),
        subject: { type: request.kind, id: record.id },
      });
    }

    await notifyLive(tx, await liveAudienceForCompany(record.companyId, input.actor.id), {
      type: "company",
      id: record.companyId,
    });

    return refusing ? "refused" : "approved";
  });
}
