import { test, expect } from "@playwright/test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { notifyLive, parseLivePayload } from "@/lib/live";

/**
 * The NOTIFY payload is cut into chunks of recipients because Postgres refuses
 * a payload of 8000 bytes or more — loudly, at the end of a transaction that
 * has already done its work (src/lib/live.ts). Fourteen people never reach the
 * cut, so the branch had never run anywhere (P11A finding 64, D105). A
 * synthetic audience runs it here, against a fake transaction that only
 * records what it was asked to execute.
 */
function fakeTx() {
  const calls: string[] = [];
  const dialect = new PgDialect();
  const tx = {
    execute: async (query: SQL) => {
      // Rendered the way the real driver would see it: the payload is the one
      // parameter of `select pg_notify('kladra', $1::text)`.
      const rendered = dialect.sqlToQuery(query);
      expect(rendered.sql).toBe("select pg_notify('kladra', $1::text)");
      calls.push(String(rendered.params[0]));
      return { rows: [] };
    },
  };
  return { tx: tx as unknown as Parameters<typeof notifyLive>[0], calls };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const event = { type: "company" as const, id: "11111111-1111-4111-8111-111111111111" };

test("an audience over the chunk size is cut, each chunk under the limit, nobody lost or doubled", async () => {
  const { tx, calls } = fakeTx();
  await notifyLive(tx, ids(400), event);
  expect(calls).toHaveLength(3);
  const seen: string[] = [];
  for (const raw of calls) {
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThan(8000);
    const payload = parseLivePayload(raw);
    expect(payload, raw.slice(0, 80)).not.toBeNull();
    expect(payload!.event).toEqual(event);
    seen.push(...payload!.userIds);
  }
  expect(seen).toHaveLength(400);
  expect(new Set(seen).size).toBe(400);
  expect(seen.sort()).toEqual(ids(400).sort());
});

test("an audience under the chunk size is one payload; duplicates and blanks are dropped; nobody is no message", async () => {
  const one = fakeTx();
  await notifyLive(one.tx, [...ids(14), ...ids(3), ""], event);
  expect(one.calls).toHaveLength(1);
  expect(parseLivePayload(one.calls[0])!.userIds).toHaveLength(14);

  const none = fakeTx();
  await notifyLive(none.tx, [], event);
  await notifyLive(none.tx, ["", ""], event);
  expect(none.calls).toHaveLength(0);
});

test("the listener trusts nothing it is handed", () => {
  expect(parseLivePayload("not json")).toBeNull();
  expect(parseLivePayload("{}")).toBeNull();
  expect(parseLivePayload(JSON.stringify({ userIds: "x", event }))).toBeNull();
  expect(parseLivePayload(JSON.stringify({ userIds: ids(1), event: { type: 7 } }))).toBeNull();
  expect(parseLivePayload(JSON.stringify({ userIds: ids(1), event }))).not.toBeNull();
});
