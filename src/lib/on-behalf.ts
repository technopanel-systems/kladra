/**
 * Paper raised for somebody else (SPEC §3 P13): "the coordinator may raise a
 * quotation or a dispatch on a rep's behalf; it counts toward that rep. If she
 * picks no rep, it is hers, under Internal Sales."
 *
 * Two people on one record, and the schema has had both columns since 0025:
 * `rep_id` is whom the paper counts for and `raised_by_id` is who pressed the
 * button. Everything that already keys on `rep_id` — achieved metres through
 * credit, the pipeline, his lists, his day, his bell — follows without being
 * told, which is the point of keeping the two apart rather than adding a third
 * column to every reader.
 *
 * What lives here is the one question both chains ask before they write: WHO is
 * this paper being raised as? The answer is a person, and every gate after it —
 * `mayRaiseFor`, the credit pool, the pickers — is asked of that person exactly
 * as if he had opened the dialog himself. There is no second rule for "raised on
 * his behalf"; there is the rep's own rule, asked with his id.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { NotAllowed } from "@/lib/authz";
import { mayBeRaisedFor, RAISED_FOR_ROLES, raisesForOthers } from "@/lib/floor";
import { RAISED_FOR_NOBODY, type RaisedForPerson } from "@/lib/on-behalf-option";
import { personName } from "@/lib/people";
import type { Role, SessionUser } from "@/lib/types";

/** May this reader raise paper for somebody else at all? Never while viewing as her (D42). */
export function raisesOnBehalf(user: SessionUser): boolean {
  return raisesForOthers(user.role) && !user.viewedBy;
}

type PersonRow = { id: string; latin: string; nameAr: string | null; email: string; role: Role; locale: string };

/** A person as the gates read him: his own id and role, and nobody looking through his eyes. */
function asPerson(row: PersonRow): SessionUser {
  return {
    id: row.id,
    name: row.latin,
    nameAr: row.nameAr,
    email: row.email,
    role: row.role,
    locale: row.locale === "ar" ? "ar" : "en",
  };
}

const columns = {
  id: users.id,
  // The Latin name is the session's own shape (SessionUser.name), never a screen's.
  latin: personName("en"),
  nameAr: users.nameAr,
  email: users.email,
  role: users.role,
  locale: users.locale,
};

/**
 * Everybody she may raise for, named in the reader's script and in name order,
 * each as the person the gates will be asked about.
 */
export async function raisedForPeople(): Promise<(SessionUser & { label: string })[]> {
  const locale = await getLocale();
  const rows = await db
    .select({ ...columns, label: personName(locale) })
    .from(users)
    .where(and(eq(users.active, true), inArray(users.role, RAISED_FOR_ROLES)))
    .orderBy(asc(personName(locale)));
  return rows.map((row) => ({ ...asPerson(row as PersonRow), label: row.label }));
}

/**
 * The same people as the "For" field offers them: the name, and the role as
 * the quieter line under it — except where the role IS the name, which is the
 * marketing account's, and a word said twice is a word to read past.
 */
export async function raisedForOptions(
  people: readonly (SessionUser & { label: string })[],
): Promise<RaisedForPerson[]> {
  const t = await getTranslations();
  return people.map((person) => {
    const role = t(`common.${person.role}`);
    return { value: person.id, label: person.label, hint: role === person.label ? undefined : role };
  });
}

/**
 * The person a paper is being raised as, from the form's `repId`.
 *
 * - Blank, "nobody", or her own id: the actor herself — for a rep that is the
 *   only answer there is, and for the coordinator it is Internal Sales.
 * - Anything else from somebody who does not raise for others is a forged form,
 *   refused with a sentence rather than quietly written as his own paper.
 * - From her, an active rep or marketing, read fresh: a person deactivated while
 *   the dialog sat open is refused here, not written onto a paper nobody works.
 */
export type RaisedAs = { ok: true; person: SessionUser; onBehalf: boolean; name: string };

/** A "For" answer refused, in a sentence at the field it was chosen in. */
export type RaiserRefusal = { ok: false; error: string; fieldErrors?: { repId: string } };

function refusedAt(sentence: string): RaiserRefusal {
  return { ok: false, error: sentence, fieldErrors: { repId: sentence } };
}

export async function resolveRaiser(
  actor: SessionUser,
  repId: string | undefined,
): Promise<RaisedAs | RaiserRefusal> {
  const wanted = (repId ?? "").trim();
  if (!wanted || wanted === RAISED_FOR_NOBODY || wanted === actor.id) {
    return { ok: true, person: actor, onBehalf: false, name: "" };
  }
  const t = await getTranslations("common");
  // Said in the form's own alert, not at a field: nobody but the coordinator
  // has a "For" field for the sentence to sit under, so a field error would be
  // a refusal nobody is shown.
  if (!raisesOnBehalf(actor)) return { ok: false, error: t("onBehalf.notForOthers") };
  // Checked by shape before it reaches a uuid cast, which would take the action
  // down as "something went wrong" rather than refuse it (rules/data.md).
  if (!UUID.test(wanted)) return refusedAt(t("onBehalf.notSomebody"));

  const locale = await getLocale();
  const [row] = await db
    .select({ ...columns, active: users.active, label: personName(locale) })
    .from(users)
    .where(eq(users.id, wanted))
    .limit(1);
  if (!row || !row.active || !mayBeRaisedFor(row.role as Role)) {
    return refusedAt(t("onBehalf.notSomebody"));
  }
  return { ok: true, person: asPerson(row as PersonRow), onBehalf: true, name: row.label };
}

/**
 * The refusal when the person a paper is raised as may not raise on its target
 * (`mayRaiseFor` said no).
 *
 * A rep's own is the silence it always was — `NotAllowed`, thrown, the answer
 * a forged id gets. Hers is a sentence at the field, because the name is hers to
 * change: the person she chose does not work this customer, or Internal Sales
 * does not and she has still to say whom it is for.
 */
export async function notTheirs(actor: SessionUser, raised: RaisedAs): Promise<RaiserRefusal> {
  if (!raised.onBehalf && !raisesOnBehalf(actor)) throw new NotAllowed();
  const t = await getTranslations("common");
  return refusedAt(
    raised.onBehalf
      ? t("onBehalf.notTheirs", { name: raised.name })
      : t("onBehalf.pickSomebody"),
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whose eyes a dialog's courtesy reads look through — the contacts at a
 * customer, who a job's metres may count for. Hers when she raises as herself,
 * and the chosen person's when she raises for him, so the form offers what his
 * own dialog would. A name that does not resolve reads as her, which offers
 * less, never more; the action refuses the name itself when she saves.
 */
export async function readerFor(actor: SessionUser, repId: unknown): Promise<SessionUser> {
  if (typeof repId !== "string" || !raisesOnBehalf(actor)) return actor;
  const raiser = await resolveRaiser(actor, repId);
  return raiser.ok ? raiser.person : actor;
}
