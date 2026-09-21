/**
 * What stores a paper names (SPEC §3, P14).
 *
 * The founder, after a third round of use: "A quotation or dispatch may name
 * more than one warehouse. Not per line — that would confuse the reps. The
 * field takes one warehouse normally and allows a second or a third in the rare
 * case, on the document as a whole. Quotations and dispatches both; the
 * dispatch difference flag compares warehouses too."
 *
 * So a paper's stores live in two places by design and are read from one. The
 * paper's own `warehouse_id` is the FIRST store and is still required, which is
 * what keeps "every paper names at least one" a promise the database makes
 * rather than one an action remembers (rules/data.md: what a row may contain
 * belongs in the database). The rare second and third are rows in
 * `quotation_warehouses` / `dispatch_warehouses`, in the order they were typed.
 *
 * Nothing anywhere reads either half on its own. Every screen and the
 * difference flag ask this file, and every write goes through `setWarehouses`,
 * so the two halves cannot come apart — which is the whole reason this is a
 * file and not four queries. The one exception is named here so that it is not
 * a surprise: the dispatches file (`src/lib/export/dispatches.ts`) joins the
 * extra table in its own SQL, because it is one statement over every load the
 * screen's filter admits, where this file answers one paper at a time. It names
 * the stores in the reader's language, as this one does.
 * `tests/csv.spec.ts` holds that copy to this one.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { dispatchWarehouses, quotationWarehouses, warehouses } from "@/db/schema";
import { z } from "zod";
import { warehouseName } from "@/lib/lookups";
import { MOST_WAREHOUSES, warehouseIdsFrom } from "@/lib/warehouse-list";

/** One store, named in the reader's language. */
export type NamedWarehouse = { id: number; name: string };

/** Which paper: the two tables are the same shape and this is the difference. */
export type PaperKind = "quotation" | "dispatch";

/**
 * The field as both actions read it, the one way (SPEC §3, P14): at least one
 * store and at most three, in the order they were typed, with the rubbish and
 * the repeats taken out by the same `warehouseIdsFrom` the dialog uses.
 *
 * Here and not in `src/lib/warehouse-list.ts`, which the dialog imports — see
 * the note there for what it cost when it was.
 */
export const warehouseIdsField = z
  .string()
  .transform(warehouseIdsFrom)
  .refine((ids) => ids.length >= 1 && ids.length <= MOST_WAREHOUSES);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The database, or the transaction a write is already inside. A read that
 * belongs to a write must see what that write has done (D85), and Drizzle's
 * transaction answers `select` the same way the pool does.
 */
type Reader = Pick<typeof db, "select">;

const EXTRAS = {
  quotation: {
    table: quotationWarehouses,
    paper: quotationWarehouses.quotationId,
    warehouse: quotationWarehouses.warehouseId,
    position: quotationWarehouses.position,
  },
  dispatch: {
    table: dispatchWarehouses,
    paper: dispatchWarehouses.dispatchId,
    warehouse: dispatchWarehouses.warehouseId,
    position: dispatchWarehouses.position,
  },
} as const;

/**
 * The stores this paper names, first one first.
 *
 * `first` is the paper's own column, which the caller has already read; this
 * adds the rare others. One store is the ordinary answer and costs one query
 * that returns nothing.
 */
export async function warehouseIdsOf(
  kind: PaperKind,
  paperId: string,
  first: number,
  exec: Reader = db,
): Promise<number[]> {
  const it = EXTRAS[kind];
  const rows = await exec
    .select({ id: it.warehouse })
    .from(it.table)
    .where(eq(it.paper, paperId))
    .orderBy(asc(it.position));
  return [first, ...rows.map((row) => row.id).filter((id) => id !== first)];
}

/**
 * What these stores are called, in the reader's language.
 *
 * Asked for a list rather than for a paper, because the drawer needs two lists
 * at once: the stores this load names, and the stores its difference from the
 * quotation mentions by id — which can include one the load no longer names.
 * The same reason `serviceNames` is read this way beside it.
 */
export async function warehouseNamesOf(
  ids: readonly number[],
  locale: string,
): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: warehouses.id, name: warehouseName(locale) })
    .from(warehouses)
    .where(inArray(warehouses.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** The paper's own list, named, in the paper's own order. */
export async function namedWarehouses(
  kind: PaperKind,
  paperId: string,
  first: number,
  locale: string,
): Promise<NamedWarehouse[]> {
  const ids = await warehouseIdsOf(kind, paperId, first);
  const byId = await warehouseNamesOf(ids, locale);
  return ids.flatMap((id) => {
    const name = byId.get(id);
    return name ? [{ id, name }] : [];
  });
}

/**
 * Write the others, inside the transaction that writes the paper.
 *
 * `ids` is the whole list as the rep typed it; the first is the paper's own
 * column and the caller has already written it there. Cleared and set, because
 * the same call settles a raise and a correction: for as long as a rep may fix
 * his lines he may fix where they come from, and the two are one save.
 */
export async function setWarehouses(
  tx: Tx,
  kind: PaperKind,
  paperId: string,
  ids: readonly number[],
): Promise<void> {
  // The others, in order, with the first one and any repeat taken out: two
  // names for one store is one store.
  const others = ids
    .slice(1)
    .filter((id, index, all) => id !== ids[0] && all.indexOf(id) === index);

  // Written out per kind rather than through the map above, because a Drizzle
  // insert wants the TypeScript key and a column's `.name` is the database's
  // — `quotation_id` instead of `quotationId`, which typechecks through a cast
  // and fails at the write.
  if (kind === "quotation") {
    await tx.delete(quotationWarehouses).where(eq(quotationWarehouses.quotationId, paperId));
    if (others.length === 0) return;
    await tx.insert(quotationWarehouses).values(
      others.map((warehouseId, index) => ({
        quotationId: paperId,
        warehouseId,
        position: index + 1,
      })),
    );
    return;
  }

  await tx.delete(dispatchWarehouses).where(eq(dispatchWarehouses.dispatchId, paperId));
  if (others.length === 0) return;
  await tx.insert(dispatchWarehouses).values(
    others.map((warehouseId, index) => ({
      dispatchId: paperId,
      warehouseId,
      position: index + 1,
    })),
  );
}

/**
 * Every store there is, live or switched off, so an action can ask whether an
 * id it was handed is a store at all.
 *
 * Not the ACTIVE ones, deliberately. The picker offers only those, so the only
 * way an inactive store arrives is a paper that already named it before the
 * admin switched it off — and refusing that would make the paper unsaveable,
 * so the rep correcting a price on it is told his warehouse is wrong (D183).
 * What this refuses is the other thing: an id that is not a store, which
 * reaches the database as a foreign-key violation, which is a 500 and not an
 * answer a person can act on.
 */
export async function knownWarehouseIds(): Promise<Set<number>> {
  const rows = await db.select({ id: warehouses.id }).from(warehouses);
  return new Set(rows.map((row) => row.id));
}
