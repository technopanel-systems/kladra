/**
 * Taking a record off the floor — the act itself, for all three kinds (S16).
 *
 * Archiving used to be three actions that each did their own writing, which was
 * fine while each was reached from one button. P14 14.8 gives them a second way
 * in: the sales manager approving somebody's request archives the record from
 * his own screen, and he answers one list holding all three kinds. Without this
 * file that answer would be a fourth copy of each write — and the copy nobody
 * presses is the one that forgets the audit row.
 *
 * So the question ("may it go, and why") stays in src/lib/archive-requests.ts
 * and in each action's own gate, and the act ("it has gone") is here.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, companies, contacts, projects, type ArchiveKind } from "@/db/schema";
import { liveAudienceForCompany, notifyLive } from "@/lib/live";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A record that can be archived, read and held. */
export type Archivable = {
  kind: ArchiveKind;
  id: string;
  /** Its own name — the customer, the person, or the job. */
  name: string;
  /** The customer it is on; for a company, itself. */
  companyId: string;
  companyName: string;
};

/**
 * Hold the record and say what it is, or null when there is nothing to archive
 * — it is gone, or somebody archived it while this decision was being made.
 *
 * `for update` first, before anything is decided about it (rules/data.md): two
 * people answering the same request in two tabs would otherwise both find it
 * live and both write.
 */
export async function holdArchivable(
  tx: Tx,
  kind: ArchiveKind,
  id: string,
): Promise<Archivable | null> {
  if (kind === "company") {
    const [row] = await tx
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.id, id), isNull(companies.archivedAt)))
      .for("update")
      .limit(1);
    return row ? { kind, id: row.id, name: row.name, companyId: row.id, companyName: row.name } : null;
  }

  if (kind === "contact") {
    const [row] = await tx
      .select({ id: contacts.id, name: contacts.name, companyId: contacts.companyId })
      .from(contacts)
      .where(and(eq(contacts.id, id), isNull(contacts.archivedAt)))
      .for("update")
      .limit(1);
    if (!row) return null;
    const [company] = await tx
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, row.companyId))
      .limit(1);
    return {
      kind,
      id: row.id,
      name: row.name,
      companyId: row.companyId,
      companyName: company?.name ?? "",
    };
  }

  const [row] = await tx
    .select({ id: projects.id, name: projects.name, companyId: projects.companyId })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.archivedAt)))
    .for("update")
    .limit(1);
  if (!row) return null;
  const [company] = await tx
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, row.companyId))
    .limit(1);
  return {
    kind,
    id: row.id,
    name: row.name,
    companyId: row.companyId,
    companyName: company?.name ?? "",
  };
}

/**
 * Archive it: the row, the audit line, and everyone whose screen has it on it.
 *
 * The reason goes in the audit line for all three kinds. A company also keeps
 * it on its own column, which is what the archive screen has always read, and
 * `archive_requests` now holds it for every kind beside them — three places for
 * one sentence, which is two too many, and the other two are read by nothing
 * new. The column stays because restoring reads it (D80); the audit line stays
 * because it is what "who took it off the floor" is answered from.
 */
export async function archiveRecord(
  tx: Tx,
  record: Archivable,
  reason: string,
  actorId: string,
): Promise<void> {
  if (record.kind === "company") {
    await tx
      .update(companies)
      .set({ archivedAt: new Date(), archiveReason: reason })
      .where(and(eq(companies.id, record.id), isNull(companies.archivedAt)));
  } else if (record.kind === "contact") {
    // Not the main contact any more: the drawer names one person at the top,
    // and a person who has left is not that person.
    await tx
      .update(contacts)
      .set({ archivedAt: new Date(), isMain: false })
      .where(and(eq(contacts.id, record.id), isNull(contacts.archivedAt)));
  } else {
    await tx
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(and(eq(projects.id, record.id), isNull(projects.archivedAt)));
  }

  await tx.insert(auditLog).values({
    userId: actorId,
    action: `${record.kind}.archive`,
    recordType: record.kind,
    recordId: record.id,
    details: { reason, companyId: record.companyId },
  });

  const audience = await liveAudienceForCompany(record.companyId, actorId);
  await notifyLive(tx, audience, { type: "company", id: record.companyId });
  if (record.kind === "project") {
    await notifyLive(tx, audience, { type: "project", id: record.id });
  }
}

/** Where a person goes to look at it — the drawer it lives in. */
export function archiveLink(record: { kind: ArchiveKind; id: string; companyId: string }): string {
  if (record.kind === "project") return `/projects?open=${record.id}`;
  // A contact has no drawer of its own: it is a card inside its customer's.
  return `/companies?open=${record.companyId}`;
}
