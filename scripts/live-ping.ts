/**
 * Push a live event at one person by hand, so the bell and the row highlight
 * can be watched moving without waiting for a real quotation.
 *
 *   npx tsx scripts/live-ping.ts rawan@technopanel.sa
 *   npx tsx scripts/live-ping.ts rawan@technopanel.sa --kind=quotationIssued --link=/queue
 *   npx tsx scripts/live-ping.ts faisal@technopanel.sa quotation --id=<uuid> --number=Q-7 --status=issued
 *   npx tsx scripts/live-ping.ts faisal@technopanel.sa company --id=<uuid>
 *   npx tsx scripts/live-ping.ts rawan@technopanel.sa notification --no-store   (count only)
 *
 * The person is named by email or by id. `notification` (the default) inserts a
 * real notifications row through src/lib/notify.ts, so the bell's number and the
 * list behind it agree; --no-store sends the count without storing anything.
 * Every other event type is announced straight through notifyLive.
 *
 * Nothing here is a second implementation: it drives the same two functions the
 * server actions will drive.
 */
import { loadEnv } from "../src/lib/env";

loadEnv();

// Imported after loadEnv(): src/db reads DATABASE_URL as it is evaluated, and a
// static import would be evaluated before the body of this file runs.
const { db, pool } = await import("../src/db/index");
const { users } = await import("../src/db/schema");
const { notifyLive } = await import("../src/lib/live");
const { createNotification, unreadCount } = await import("../src/lib/notify");
const { eq, or } = await import("drizzle-orm");
type LiveEvent = import("../src/lib/types").LiveEvent;

const EVENTS = ["notification", "quotation", "dispatch", "company", "project"] as const;
type EventType = (typeof EVENTS)[number];

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (const arg of argv) {
  if (arg.startsWith("--")) {
    const [key, ...rest] = arg.slice(2).split("=");
    flags.set(key, rest.length ? rest.join("=") : "true");
  } else {
    positional.push(arg);
  }
}

const who = positional[0];
const type = (positional[1] ?? "notification") as EventType;

function fail(message: string): never {
  console.error(`live-ping — ${message}`);
  console.error(`usage: npx tsx scripts/live-ping.ts <email|user-id> [${EVENTS.join("|")}] [--id=…]`);
  process.exit(1);
}

if (!who) fail("name the person: an email address or a user id");
if (!EVENTS.includes(type)) fail(`unknown event "${type}"`);

const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(who);

try {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(isUuid ? or(eq(users.id, who), eq(users.email, who)) : eq(users.email, who))
    .limit(1);

  if (!user) fail(`no user matches "${who}"`);

  if (type === "notification" && flags.get("store") !== "false" && !flags.has("no-store")) {
    const id = await db.transaction((tx) =>
      createNotification(tx, {
        kind: flags.get("kind") ?? "ping",
        link: flags.get("link") ?? "/",
        params: { from: "live-ping" },
        userId: user.id,
      }),
    );
    const unread = await unreadCount(db, user.id);
    console.log(`live-ping — notification stored for ${user.name} <${user.email}>`);
    console.log(`            id ${id} · unread now ${unread}`);
  } else {
    const id = flags.get("id") ?? crypto.randomUUID();
    const event: LiveEvent =
      type === "notification"
        ? { type: "notification", id, unread: await unreadCount(db, user.id) }
        : type === "quotation"
          ? {
              type: "quotation",
              id,
              number: flags.get("number") ?? "Q-1",
              status: flags.get("status") ?? "issued",
            }
          : type === "dispatch"
            ? {
                type: "dispatch",
                id,
                number: flags.get("number") ?? "D-1",
                status: flags.get("status") ?? "approved",
              }
            : { type, id };

    await notifyLive(db, [user.id], event);
    console.log(`live-ping — ${type} sent to ${user.name} <${user.email}>`);
    console.log(`            ${JSON.stringify(event)}`);
    if (!flags.has("id") && type !== "notification") {
      console.log("            (no --id given, so this id matches no record on screen)");
    }
  }
} catch (err) {
  console.error("live-ping failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
