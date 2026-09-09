"use server";

/**
 * The dispatch chain (SPEC S37–S43, §3).
 *
 * The rep raises a request against an issued quotation: which lines, how many
 * of each, how they travel, where to, and on what terms. The coordinator checks
 * it against the paper and either approves it with SMAC's dispatch number or
 * refuses it with a reason.
 *
 * Approval is the only event that counts (S41). Not the request, not the
 * number, not the day the truck left: the rep's month moves when she presses
 * Approve, and if something goes wrong afterwards a new dispatch is raised
 * rather than this one edited. That is also the moment the project is won
 * (S21), which nothing here writes down — `projectIsWonSql` asks the question
 * instead of storing an answer that could go stale.
 *
 * The quantity rule is enforced twice on purpose. The dialog shows what is left
 * on each line so a rep is not asked to guess, and the transaction checks it
 * again before writing, because between opening a dialog and pressing Save
 * somebody else can spend the same panels (D12).
 */

import { dispatchEvent } from "@/lib/dispatch-events";
import { quotationEvent } from "@/lib/quotation-events";
import { withTheRep } from "@/lib/with-the-rep";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  companies,
  dispatchItems,
  dispatches,
  projects,
  quotationItems,
  quotations,
  shipmentMethods,
  users,
} from "@/db/schema";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { creditDispatch, resolveCredit } from "@/lib/credit-rows";
import { seesEveryDispatch, type DispatchStatus } from "@/lib/dispatches";
import { dispatchable, type QuotationStatus } from "@/lib/quotations";
import { isSmacClash, smacHolder } from "@/lib/smac";
import { SELLING_ROLES } from "@/lib/floor";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import {
  detailsFor,
  needsNote,
  PAYMENT_DETAILS,
  PAYMENT_TERMS,
  type PaymentDetail,
  type PaymentTerms,
} from "@/lib/payment";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { holdDispatch, holdQuotation, isLiveRevision } from "@/lib/hold";
import { liveAudienceForCompany, notifyLive } from "@/lib/live";
import { clearNotifications, createNotification } from "@/lib/notify";
import type { ActionResult, Role, SessionUser } from "@/lib/types";
import {
  mayRaiseFor,
  maySeeCompany,
  onCompanySql,
  onProjectSql,
} from "@/lib/visibility";

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
  ...roles: Role[]
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("dispatches action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

/** Every screen a dispatch shows on, plus the two the target reads from. */
function revalidateChain(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/dispatches", "page");
  revalidatePath("/[locale]/queue", "page");
  revalidatePath("/[locale]/quotations", "page");
  revalidatePath("/[locale]/projects", "page");
}

/** The active coordinators — the people a request is actually waiting on (S9). */
async function coordinators(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), eq(users.role, "coordinator")));
  return rows.map((row) => row.id);
}

type Loaded = {
  id: string;
  number: number;
  label: string;
  status: DispatchStatus;
  quotationId: string;
  quotationLabel: string;
  projectId: string;
  companyId: string;
  /** The rep who owns the COMPANY — who hears about it, and whose floor it is. */
  companyRepId: string;
  /** The rep whose PROJECT it is, and whether this actor is on that job (D147). */
  projectRepId: string;
  shared: boolean;
  onProject: boolean;
};

/**
 * One dispatch, or NotAllowed. Never says whether a dispatch it will not show
 * exists: a rep asking for somebody else's id gets the same answer either way.
 */
async function load(actor: SessionUser, dispatchId: string): Promise<Loaded | null> {
  const [row] = await db
    .select({
      id: dispatches.id,
      number: dispatches.number,
      status: dispatches.status,
      quotationId: dispatches.quotationId,
      quotationNumber: quotations.number,
      quotationRevision: quotations.revision,
      projectId: quotations.projectId,
      companyId: quotations.companyId,
      companyRepId: companies.repId,
      projectRepId: projects.repId,
      shared: onCompanySql(actor, sql`companies.id`).mapWith(Boolean),
      onProject: onProjectSql(actor, sql`quotations.project_id`).mapWith(Boolean),
    })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(projects, eq(projects.id, quotations.projectId))
    .where(eq(dispatches.id, dispatchId))
    .limit(1);

  if (!row) return null;
  if (!seesEveryDispatch(actor) && !maySeeCompany(actor, row.companyRepId, row.shared))
    throw new NotAllowed();
  return {
    id: row.id,
    number: row.number,
    label: dispatchLabel(row.number),
    status: row.status as DispatchStatus,
    quotationId: row.quotationId,
    quotationLabel: quotationLabel(row.quotationNumber, row.quotationRevision),
    projectId: row.projectId,
    companyId: row.companyId,
    companyRepId: row.companyRepId,
    projectRepId: row.projectRepId,
    shared: row.shared,
    onProject: row.onProject,
  };
}

/**
 * One line of a request: which quotation line, and how many of it.
 *
 * Zero is allowed here and dropped below — the dialog lists every line of the
 * quotation with a box beside it, and leaving a line at zero is how a rep says
 * "not this one this time", not an error to answer.
 */
const itemSchema = z.object({
  quotationItemId: z.uuid(),
  qty: z.coerce.number().int().min(0).max(100_000),
});

const itemsSchema = z.array(itemSchema).min(1).max(60);

/** The lines arrive as one JSON field, for the reason in src/actions/quotations.ts. */
function readItems(formData: FormData): z.infer<typeof itemsSchema> | "invalid" {
  const raw = field(formData, "items");
  if (!raw) return "invalid";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "invalid";
  }
  const result = itemsSchema.safeParse(parsed);
  return result.success ? result.data : "invalid";
}

const detailsSchema = z.object({
  shipmentMethodId: z.coerce.number().int().positive(),
  /**
   * Which store this load leaves from (SPEC §3, P12-9). One per whole dispatch,
   * never per line: the coordinator rings one store before she approves it.
   * The dialog opens on the quotation's own, and a rep changes it when the
   * panels are coming out of somewhere else.
   */
  warehouseId: z.coerce.number().int().positive(),
  destination: z.string().trim().min(1).max(500),
  /**
   * How it is being paid for (SPEC §3, P12-10): the choice, the second answer
   * where the choice asks for one, and the note the other two require. Flat
   * here and checked together below, because a refusal has to name the field
   * that is wrong and a Zod refinement over the whole object names none.
   */
  paymentTerms: z.enum(PAYMENT_TERMS),
  paymentDetail: z.enum(PAYMENT_DETAILS).optional(),
  paymentNote: z.string().trim().max(1000).optional(),
});

type Payment = {
  paymentTerms: PaymentTerms;
  paymentDetail: PaymentDetail | null;
  paymentNote: string | null;
};

/**
 * The two rules that hold between the three answers, said once for the raise
 * and the correction alike (SPEC §3).
 *
 * The second question is answered when it is asked, with one of ITS answers —
 * "on delivery" is not a thing a bank transfer can be — and the note is there
 * for the two finance reviews. Where there is no second question the detail is
 * dropped rather than refused: a rep who chooses transfer, answers it, then
 * changes his mind to credit has not made a mistake, and the browser is not
 * where that gets decided (the column refuses it either way).
 */
function readPayment(
  input: z.infer<typeof detailsSchema>,
  says: { required: string; noteRequired: string },
): { ok: true; payment: Payment } | { ok: false; field: string; message: string } {
  const allowed = detailsFor(input.paymentTerms);
  if (allowed.length > 0 && (!input.paymentDetail || !allowed.includes(input.paymentDetail))) {
    return { ok: false, field: "paymentDetail", message: says.required };
  }
  const note = input.paymentNote?.trim() || null;
  if (needsNote(input.paymentTerms) && !note) {
    return { ok: false, field: "paymentNote", message: says.noteRequired };
  }
  return {
    ok: true,
    payment: {
      paymentTerms: input.paymentTerms,
      paymentDetail: allowed.length > 0 ? (input.paymentDetail ?? null) : null,
      paymentNote: note,
    },
  };
}

type QuantityCheck = "ok" | "tooMuch" | "notOnQuotation";

/**
 * Whether a request's lines fit inside what the quotation has left (D12).
 *
 * Run inside the caller's transaction and reading the committed quantities
 * there, so two reps pressing Save at the same second cannot both spend the
 * last panel. `exclude` leaves this dispatch's own existing lines out of the
 * sum, which is what an edit needs — otherwise a request always overspends
 * itself.
 */
async function checkQuantities(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  quotationId: string,
  asked: { quotationItemId: string; qty: number }[],
  exclude: string | null,
): Promise<QuantityCheck> {
  const lines = await tx
    .select({
      id: quotationItems.id,
      qty: quotationItems.qty,
      committed: sql<number>`(
        select coalesce(sum(di.qty), 0)::int
          from dispatch_items di
          join dispatches d on d.id = di.dispatch_id
         where di.quotation_item_id = quotation_items.id
           and d.status in ('submitted', 'approved')
           and (${exclude}::uuid is null or d.id <> ${exclude}::uuid)
      )`,
    })
    .from(quotationItems)
    .where(
      and(
        eq(quotationItems.quotationId, quotationId),
        inArray(
          quotationItems.id,
          asked.map((item) => item.quotationItemId),
        ),
      ),
    );

  const byId = new Map(lines.map((line) => [line.id, line]));
  if (byId.size !== asked.length) return "notOnQuotation";

  for (const item of asked) {
    const line = byId.get(item.quotationItemId);
    if (!line) return "notOnQuotation";
    if (item.qty > line.qty - Number(line.committed)) return "tooMuch";
  }
  return "ok";
}

/** The lines a rep actually asked for. A line left at zero is "not this time". */
function askedFor(items: { quotationItemId: string; qty: number }[]) {
  return items.filter((item) => item.qty > 0);
}

/** Replaces a dispatch's lines outright — an edit is the whole list again. */
async function replaceItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  dispatchId: string,
  asked: { quotationItemId: string; qty: number }[],
): Promise<void> {
  await tx.delete(dispatchItems).where(eq(dispatchItems.dispatchId, dispatchId));
  await tx.insert(dispatchItems).values(
    asked.map((item) => ({ dispatchId, quotationItemId: item.quotationItemId, qty: item.qty })),
  );
}

/**
 * A rep raises a dispatch against an issued quotation (§3, S38).
 *
 * Rep only, and only on his own company: a dispatch is what moves his target,
 * so somebody else raising it would move the wrong month for the wrong person.
 */
export async function requestDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");
    const tc = await getTranslations("common");

    const parsed = z
      .object({ quotationId: z.uuid(), ...detailsSchema.shape })
      .safeParse({
        quotationId: field(formData, "quotationId"),
        shipmentMethodId: field(formData, "shipmentMethodId"),
        warehouseId: field(formData, "warehouseId"),
        destination: field(formData, "destination"),
        paymentTerms: field(formData, "paymentTerms"),
        paymentDetail: field(formData, "paymentDetail"),
        paymentNote: field(formData, "paymentNote"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const paid = readPayment(parsed.data, {
      required: tc("required"),
      noteRequired: td("payment.noteRequired"),
    });
    if (!paid.ok) {
      return { ok: false, error: paid.message, fieldErrors: { [paid.field]: paid.message } };
    }
    const { payment } = paid;

    const items = readItems(formData);
    if (items === "invalid") return { ok: false, error: td("needsItems") };

    const [quotation] = await db
      .select({
        id: quotations.id,
        number: quotations.number,
        revision: quotations.revision,
        status: quotations.status,
        projectId: quotations.projectId,
        companyId: quotations.companyId,
        companyRepId: companies.repId,
        companyArchived: companies.archivedAt,
        projectRepId: projects.repId,
        onProject: onProjectSql(actor, sql`quotations.project_id`).mapWith(Boolean),
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .innerJoin(projects, eq(projects.id, quotations.projectId))
      .where(eq(quotations.id, parsed.data.quotationId))
      .limit(1);
    if (!quotation) return { ok: false, error: td("quotationNotFound") };
    if (!mayRaiseFor(actor, quotation.companyRepId, quotation.projectRepId, quotation.onProject))
      throw new NotAllowed();
    if (quotation.companyArchived) return { ok: false, error: td("quotationNotFound") };
    // S38: the paper has to exist before goods move against it. A request that
    // has been sent back or refused is not a quotation yet.
    if (!dispatchable(quotation.status as QuotationStatus)) {
      return { ok: false, error: td("quotationNotIssued") };
    }
    // And only the live revision: once it has been revised the customer holds
    // the new paper, and goods sent against the old one move on a price nobody
    // agreed (S34, S35).
    const [newer] = await db
      .select({ id: quotations.id })
      .from(quotations)
      .where(
        and(
          eq(quotations.number, quotation.number),
          sql`quotations.revision > ${quotation.revision}`,
        ),
      )
      .limit(1);
    if (newer) return { ok: false, error: td("supersededQuotation") };

    const [method] = await db
      .select({ id: shipmentMethods.id })
      .from(shipmentMethods)
      .where(
        and(eq(shipmentMethods.id, parsed.data.shipmentMethodId), eq(shipmentMethods.active, true)),
      )
      .limit(1);
    if (!method) return { ok: false, error: tc("invalid") };

    const asked = askedFor(items);
    if (asked.length === 0) return { ok: false, error: td("needsItems") };

    // Whose metres these are (D148). Resolved from the job rather than trusted
    // from the form: the answer arrived as a name the dialog offered a minute
    // ago, and a share is a permission that can be taken away in a minute. A
    // name that is not on the job now is a refusal, not a silent fallback —
    // the rep chose a person and the app must not quietly choose another.
    const credit = await resolveCredit(quotation.projectId, actor.id, field(formData, "credit"));
    if (!credit) return { ok: false, error: tc("credit.notOnProject") };

    const outcome = await db.transaction(async (tx) => {
      // The quotation row is held for the rest of the transaction, so two
      // requests against it run one after the other and the second reads the
      // lines the first wrote (D85). A revision raised meanwhile holds the
      // same row, which is why "still live" is asked after the hold.
      const held = await holdQuotation(tx, quotation.id);
      // And so is the STATUS asked after it. The read above happened before the
      // row was held, so a quotation withdrawn or sent back in between would
      // have taken a dispatch anyway — the hole D85 is about, in the one place
      // that still had it (P12-10).
      if (!dispatchable(held as QuotationStatus)) return { failure: "notDispatchable" } as const;
      if (!(await isLiveRevision(tx, quotation.id))) return { failure: "superseded" } as const;
      // Checked before anything is written, so a refusal is a sentence rather
      // than a rolled-back transaction wearing "something went wrong".
      const check = await checkQuantities(tx, quotation.id, asked, null);
      if (check !== "ok") return { failure: check } as const;

      const [row] = await tx
        .insert(dispatches)
        .values({
          number: sql`nextval('dispatch_numbers')`,
          quotationId: quotation.id,
          repId: actor.id,
          shipmentMethodId: parsed.data.shipmentMethodId,
          warehouseId: parsed.data.warehouseId,
          destination: parsed.data.destination,
          ...payment,
        })
        .returning({ id: dispatches.id, number: dispatches.number });

      await replaceItems(tx, row.id, asked);

      // Whose metres these are, frozen at the raise and never inherited
      // (D148): one name on a job one rep works, and on a shared one whatever
      // he answered above.
      await creditDispatch(tx, row.id, credit);

      /*
       * "A dispatch implies the customer accepted that quotation" (SPEC §3).
       *
       * Sending goods against a price is the strongest answer a customer gives,
       * and a rep had to remember to record a second, weaker one afterwards.
       * Recorded here, under the hold the dispatch is written under, so the two
       * facts cannot disagree: there is no moment where goods are moving
       * against a quotation the app still says the customer has not answered.
       *
       * Not gated by "only its raiser may decide" the way the manual action is:
       * a rep on a shared job who sends the goods is recording what the CUSTOMER
       * did, not editing another rep's record. The manual action stays for the
       * quotation accepted and not yet dispatched, which is the founder's own
       * carve-out, and a later refusal by the desk does not undo this — she
       * refuses the load, and the customer's yes is not hers to withdraw.
       *
       * No second notice: the coordinator is being told about the dispatch in
       * this same transaction, and "he accepted" beside "he has sent you a
       * request against it" is one event announced twice (D79).
       */
      if (held === "issued") {
        await tx
          .update(quotations)
          .set({ status: "accepted", decidedAt: new Date() })
          .where(eq(quotations.id, quotation.id));

        await tx.insert(auditLog).values({
          userId: actor.id,
          action: quotationEvent("accepted"),
          recordType: "quotation",
          recordId: quotation.id,
          details: { impliedBy: "dispatch" },
        });

        // What "issued" was telling him to chase has happened (D79).
        await clearNotifications(tx, { type: "quotation", id: quotation.id }, ["quotationIssued"]);

        await notifyLive(
          tx,
          await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]),
          {
            type: "quotation",
            id: quotation.id,
            number: quotationLabel(quotation.number, quotation.revision),
            status: "accepted",
          },
        );
      }

      const label = dispatchLabel(row.number);
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("request"),
        recordType: "dispatch",
        recordId: row.id,
        details: { quotationId: quotation.id, lines: asked.length },
      });

      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: "dispatchRequested",
          params: { label, repId: actor.id },
          link: `/queue?dispatch=${row.id}`,
          subject: { type: "dispatch", id: row.id },
        });
      }

      await notifyLive(tx, await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]), {
        type: "dispatch",
        id: row.id,
        number: label,
        status: "submitted",
      });
      return { id: row.id } as const;
    });

    if ("failure" in outcome) {
      return {
        ok: false,
        error:
          outcome.failure === "tooMuch"
            ? td("tooMuch")
            : outcome.failure === "superseded"
              ? td("supersededQuotation")
              : outcome.failure === "notDispatchable"
                ? td("quotationNotIssued")
                : td("notOnQuotation"),
      };
    }

    revalidateChain();
    return { ok: true, data: { dispatchId: outcome.id } };
  }, ...SELLING_ROLES);
}

/**
 * The rep changes his own request while it is still waiting (S54's reason: a
 * form retyped from scratch is a form filled in on WhatsApp instead).
 *
 * Once it is approved or refused it is finished; a change after that is a new
 * dispatch (S41).
 */
export async function updateDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");
    const tc = await getTranslations("common");

    const parsed = z
      .object({ dispatchId: z.uuid(), ...detailsSchema.shape })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        shipmentMethodId: field(formData, "shipmentMethodId"),
        warehouseId: field(formData, "warehouseId"),
        destination: field(formData, "destination"),
        paymentTerms: field(formData, "paymentTerms"),
        paymentDetail: field(formData, "paymentDetail"),
        paymentNote: field(formData, "paymentNote"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const paid = readPayment(parsed.data, {
      required: tc("required"),
      noteRequired: td("payment.noteRequired"),
    });
    if (!paid.ok) {
      return { ok: false, error: paid.message, fieldErrors: { [paid.field]: paid.message } };
    }
    const { payment } = paid;

    const items = readItems(formData);
    if (items === "invalid") return { ok: false, error: td("needsItems") };

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (!mayRaiseFor(actor, dispatch.companyRepId, dispatch.projectRepId, dispatch.onProject))
      throw new NotAllowed();
    // Waiting on the desk, or sent back by it (SPEC §3, P12-10). Refusing a
    // load is the dispatch chain's Send back — §2 S53 calls a request sent back
    // or refused one kind of event — and a refusal that cannot be answered
    // means retyping every line, now that nothing is carried forward.
    if (!withTheRep(dispatch.status)) return { ok: false, error: td("notWaiting") };

    const asked = askedFor(items);
    if (asked.length === 0) return { ok: false, error: td("needsItems") };

    // The same question the raise asked, answered again (D148). A dispatch
    // still waiting has moved nothing and earned nobody anything, so for as
    // long as a rep may correct its quantities he may correct who they count
    // for; the approval is what freezes both.
    const credit = await resolveCredit(dispatch.projectId, actor.id, field(formData, "credit"));
    if (!credit) return { ok: false, error: tc("credit.notOnProject") };

    const failure = await db.transaction(async (tx) => {
      // Held, and the state read AFTER the hold: approved while he was typing
      // is not his to change, and the lines of the quotation are read after it
      // too, as for a new request (D85).
      const held = await holdDispatch(tx, dispatch.id);
      // Null is a row that is not there any more, which is not his either.
      if (!held || !withTheRep(held)) return "answered";
      const cameBack = held === "refused";
      const parent = await holdQuotation(tx, dispatch.quotationId);
      // A refused request may have sat for a week, and the paper under it can
      // have been revised or withdrawn since (S34, S38).
      if (cameBack && !dispatchable(parent as QuotationStatus)) return "notDispatchable";
      if (cameBack && !(await isLiveRevision(tx, dispatch.quotationId))) return "superseded";
      const check = await checkQuantities(tx, dispatch.quotationId, asked, dispatch.id);
      if (check !== "ok") return check;
      await replaceItems(tx, dispatch.id, asked);
      await creditDispatch(tx, dispatch.id, credit);

      await tx
        .update(dispatches)
        .set({
          shipmentMethodId: parsed.data.shipmentMethodId,
          // Correctable for exactly as long as the quantities beside it are: a
          // request waiting on the desk has moved nothing yet (SPEC §3, P12-9).
          warehouseId: parsed.data.warehouseId,
          destination: parsed.data.destination,
          ...payment,
          // Back on the desk, and her words go with the state they explained:
          // a request he has already fixed must not still say what was wrong
          // with it (D72, and the constraint that holds the pair together).
          status: "submitted",
          refuseReason: null,
        })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("update"),
        recordType: "dispatch",
        recordId: dispatch.id,
        // Where it came from, always — the quotation's own update row has said
        // it that way since P9, and the desk's "arrived today" reads it back to
        // count a refusal he has fixed as work landing again (P12-10).
        details: { lines: asked.length, from: held },
      });

      // Only news to her if it had been sent back: an edit to something already
      // on her desk is the same request with different lines. The mirror of
      // what a fixed quotation does (src/actions/quotations.ts).
      if (cameBack) {
        // He has done what the refusal asked, so it stops being a row (D79).
        await clearNotifications(tx, { type: "dispatch", id: dispatch.id }, ["dispatchRefused"]);
        for (const userId of await coordinators()) {
          await createNotification(tx, {
            userId,
            kind: "dispatchRequested",
            params: { label: dispatch.label, repId: actor.id },
            link: `/queue?dispatch=${dispatch.id}`,
            subject: { type: "dispatch", id: dispatch.id },
          });
        }
      }

      await notifyLive(tx, await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator"]), {
        type: "dispatch",
        id: dispatch.id,
        number: dispatch.label,
        status: "submitted",
      });
      return null;
    });

    if (failure === "answered") return { ok: false, error: td("notWaiting") };
    if (failure === "tooMuch") return { ok: false, error: td("tooMuch") };
    if (failure === "notOnQuotation") return { ok: false, error: td("notOnQuotation") };
    if (failure === "notDispatchable") return { ok: false, error: td("quotationNotIssued") };
    if (failure === "superseded") return { ok: false, error: td("supersededQuotation") };

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, ...SELLING_ROLES);
}

/**
 * The refusal for a number another dispatch carries: at the field, naming the
 * holder (D88) — the dispatch side of `taken` in src/actions/quotations.ts.
 */
async function taken(
  number: string,
  say: (holder: string | null) => string,
): Promise<ActionResult<{ dispatchId: string }>> {
  const sentence = say(await smacHolder("dispatch", number));
  return { ok: false, error: sentence, fieldErrors: { smacDispatchNumber: sentence } };
}

/**
 * The coordinator approves it with SMAC's dispatch number (S39).
 *
 * This is the event the whole month rests on: the approved m² counts toward the
 * rep's target from here, and the project is won from here (S21, S41, S43).
 * Both are read back out of this row rather than written anywhere else.
 */
export async function approveDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");

    const parsed = z
      .object({ dispatchId: z.uuid(), smacDispatchNumber: z.string().trim().min(1).max(60) })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        smacDispatchNumber: field(formData, "smacDispatchNumber"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: td("numberRequired"),
        fieldErrors: { smacDispatchNumber: td("numberRequired") },
      };
    }

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (dispatch.status !== "submitted") return { ok: false, error: td("notWaiting") };

    const outcome = await db.transaction(async (tx) => {
      // Held, and still waiting (D85). And still against the live revision:
      // D36 was asked when the dispatch was raised and never again, so a
      // quotation revised while it sat in the queue could be approved on a
      // price the customer no longer holds.
      if ((await holdDispatch(tx, dispatch.id)) !== "submitted") return "answered" as const;
      if (!(await isLiveRevision(tx, dispatch.quotationId))) return "superseded" as const;
      await tx
        .update(dispatches)
        .set({
          status: "approved",
          smacDispatchNumber: parsed.data.smacDispatchNumber,
          approvedAt: new Date(),
          refuseReason: null,
        })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("approve"),
        recordType: "dispatch",
        recordId: dispatch.id,
        details: { smacDispatchNumber: parsed.data.smacDispatchNumber },
      });

      // Answered, so it is off her queue and off her bell (D79).
      await clearNotifications(tx, { type: "dispatch", id: dispatch.id }, [
        "dispatchRequested",
      ]);

      await createNotification(tx, {
        userId: dispatch.companyRepId,
        kind: "dispatchApproved",
        params: { label: dispatch.label, smacNumber: parsed.data.smacDispatchNumber },
        link: `/dispatches?open=${dispatch.id}`,
        subject: { type: "dispatch", id: dispatch.id },
      });

      await notifyLive(
        tx,
        await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator", "manager"]),
        { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "approved" },
      );
      return "ok" as const;
    }).catch((error: unknown) => {
      // The index fired: the number is on another dispatch (D88).
      if (isSmacClash(error, "dispatch")) return "clash" as const;
      throw error;
    });
    if (outcome === "clash") {
      return taken(parsed.data.smacDispatchNumber, (holder) =>
        holder
          ? td("smacTaken", { number: parsed.data.smacDispatchNumber, label: holder })
          : td("smacTakenSomewhere", { number: parsed.data.smacDispatchNumber }),
      );
    }
    if (outcome === "answered") return { ok: false, error: td("notWaiting") };
    if (outcome === "superseded") return { ok: false, error: td("supersededQuotation") };

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "coordinator");
}

/**
 * The coordinator corrects a SMAC dispatch number she typed wrong (D88). The
 * row is held (D85); the status, the instant and the month it counts in do not
 * move — the number is a label on an approval, not the approval. The old one
 * stays in the audit log with the new one beside it.
 */
export async function correctDispatchNumberAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");

    const parsed = z
      .object({ dispatchId: z.uuid(), smacDispatchNumber: z.string().trim().min(1).max(60) })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        smacDispatchNumber: field(formData, "smacDispatchNumber"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: td("numberRequired"),
        fieldErrors: { smacDispatchNumber: td("numberRequired") },
      };
    }

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (dispatch.status !== "approved") return { ok: false, error: td("notApproved") };

    const outcome = await db
      .transaction(async (tx) => {
        if ((await holdDispatch(tx, dispatch.id)) !== "approved") return "notApproved" as const;

        const [current] = await tx
          .select({ smacDispatchNumber: dispatches.smacDispatchNumber })
          .from(dispatches)
          .where(eq(dispatches.id, dispatch.id));
        const from = current?.smacDispatchNumber ?? null;
        if (from === parsed.data.smacDispatchNumber) return "same" as const;

        await tx
          .update(dispatches)
          .set({ smacDispatchNumber: parsed.data.smacDispatchNumber })
          .where(eq(dispatches.id, dispatch.id));

        await tx.insert(auditLog).values({
          userId: actor.id,
          action: dispatchEvent("correctNumber"),
          recordType: "dispatch",
          recordId: dispatch.id,
          details: { from, to: parsed.data.smacDispatchNumber },
        });

        await notifyLive(
          tx,
          await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator", "manager"]),
          { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "approved" },
        );
        return "ok" as const;
      })
      .catch((error: unknown) => {
        if (isSmacClash(error, "dispatch")) return "clash" as const;
        throw error;
      });
    if (outcome === "clash") {
      return taken(parsed.data.smacDispatchNumber, (holder) =>
        holder
          ? td("smacTaken", { number: parsed.data.smacDispatchNumber, label: holder })
          : td("smacTakenSomewhere", { number: parsed.data.smacDispatchNumber }),
      );
    }
    if (outcome === "notApproved") return { ok: false, error: td("notApproved") };
    if (outcome === "same") {
      return {
        ok: false,
        error: td("sameNumber"),
        fieldErrors: { smacDispatchNumber: td("sameNumber") },
      };
    }

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "coordinator");
}

/**
 * The coordinator refuses it, with a reason (S39). The reason is not optional:
 * a decision that ends somebody's work reaches them with it written down (S53).
 *
 * Refusing gives the quantities back — a refused request has spent nothing, so
 * the same panels are available to the next one (D12).
 */
export async function refuseDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const td = await getTranslations("dispatches");

    const parsed = z
      .object({ dispatchId: z.uuid(), reason: z.string().trim().min(1).max(2000) })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        reason: field(formData, "reason"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: t("reasonRequired"),
        fieldErrors: { reason: t("reasonRequired") },
      };
    }

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (dispatch.status !== "submitted") return { ok: false, error: td("notWaiting") };

    const held = await db.transaction(async (tx) => {
      // Held, and still waiting (D85).
      if ((await holdDispatch(tx, dispatch.id)) !== "submitted") return false;
      await tx
        .update(dispatches)
        .set({ status: "refused", refuseReason: parsed.data.reason })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("refuse"),
        recordType: "dispatch",
        recordId: dispatch.id,
        details: { reason: parsed.data.reason },
      });

      // Refusing it is answering it too; what happens next is a new dispatch,
      // which is a new row and a new notice (D79).
      await clearNotifications(tx, { type: "dispatch", id: dispatch.id }, [
        "dispatchRequested",
      ]);

      await createNotification(tx, {
        userId: dispatch.companyRepId,
        kind: "dispatchRefused",
        params: { label: dispatch.label, reason: parsed.data.reason },
        link: `/dispatches?open=${dispatch.id}`,
        subject: { type: "dispatch", id: dispatch.id },
      });

      await notifyLive(
        tx,
        await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator"]),
        { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "refused" },
      );
      return true;
    });
    if (!held) return { ok: false, error: td("notWaiting") };

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "coordinator");
}
