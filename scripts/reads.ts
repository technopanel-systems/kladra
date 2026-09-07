/**
 * What the database is asked, screen by screen — the repeatable form of the
 * 11C measurement (WORKFLOW §3 "What the database is asked", D107, §5 #71).
 *
 *   npx tsx scripts/reads.ts                 # against 3102 (production build) and DATABASE_URL
 *   npx tsx scripts/reads.ts --origin http://localhost:3101
 *   npx tsx scripts/reads.ts --write         # rewrite scripts/reads.baseline.json
 *   npx tsx scripts/reads.ts --check         # exit 1 when a screen asks more than its baseline
 *
 * Method, the same one done by hand in 11C: statement logging is switched on
 * for the run (`log_min_duration_statement = 0`, a prefix that names the
 * database and the application), one marker statement is written before and
 * after each screen is fetched with a real session cookie, and the container's
 * log is read back and cut at the markers. Counted: `execute` and `statement`
 * lines — one per round trip; `parse` and `bind` lines are the same trip.
 * Both settings are reset in a `finally`, and the sessions it made are deleted
 * — on Ctrl+C too. `alter system` writes the cluster's own configuration file,
 * not this connection's, so a run killed halfway would otherwise leave every
 * statement of every database in this container logged for ever, the test
 * suite's included.
 *
 * It needs the production server up — `npx next start -H 127.0.0.1 -p 3102` —
 * because the dev server's numbers include its own compilation reads. It does
 * not start or stop anything itself: 3102 has to be down before `npm run build`,
 * and a script that starts servers is how that gets forgotten.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadEnv } from "../src/lib/env";
import { kladraAdapter, SESSION_MAX_AGE } from "../src/auth.config";
import { navItemsFor } from "../src/components/shell/nav";
import type { Role } from "../src/lib/types";

loadEnv();

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  args.set(key, value);
}
const origin = args.get("origin") ?? "http://127.0.0.1:3102";
const container = args.get("container") ?? "kladra-db-1";
const baselinePath = join(import.meta.dirname, "reads.baseline.json");
const APP_NAME = "kladra-reads";

const PERSONAS: { email: string; role: Role }[] = [
  { email: "faisal@technopanel.com.sa", role: "rep" },
  { email: "rawan@technopanel.com.sa", role: "coordinator" },
  { email: "abdulrahman@technopanel.com.sa", role: "manager" },
  { email: "jerom@technopanel.com.sa", role: "admin" },
];

type Screen = { role: Role; path: string };
type Measure = Screen & { statements: number; dbMs: number; worstMs: number; worst: string };

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const dbName = new URL(url).pathname.replace(/^\//, "");
const pg = new Client({ connectionString: url, application_name: APP_NAME });
await pg.connect();

async function health(): Promise<void> {
  const res = await fetch(`${origin}/api/health`).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(`${origin} is not answering — start the production build first (see the header).`);
  }
}

async function sessionFor(email: string): Promise<{ cookie: string; token: string; userId: string }> {
  const { rows } = await pg.query<{ id: string }>("select id from users where email = $1", [email]);
  if (!rows[0]) throw new Error(`no user ${email}`);
  const token = randomUUID();
  await kladraAdapter.createSession!({
    sessionToken: token,
    userId: rows[0].id,
    expires: new Date(Date.now() + SESSION_MAX_AGE * 1000),
  });
  return { cookie: `authjs.session-token=${token}`, token, userId: rows[0].id };
}

/** The screens a role sees, from the rail (D99), plus one open drawer per list. */
async function screensFor(role: Role, userId: string): Promise<string[]> {
  const paths = navItemsFor(role).map((item) => item.href);
  const one = async (sql: string, params: unknown[] = []) =>
    (await pg.query<{ id: string }>(sql, params)).rows[0]?.id;
  const mine = role === "rep" ? "and rep_id = $1" : "";
  const params = role === "rep" ? [userId] : [];
  const company = await one(`select id from companies where archived_at is null ${mine} order by updated_at desc limit 1`, params);
  const project = await one(
    `select p.id from projects p join companies c on c.id = p.company_id where p.archived_at is null ${mine.replace("rep_id", "c.rep_id")} order by p.updated_at desc limit 1`,
    params,
  );
  const quotation = await one(`select id from quotations ${role === "rep" ? "where rep_id = $1" : ""} order by updated_at desc limit 1`, params);
  const dispatch = await one(`select id from dispatches ${role === "rep" ? "where rep_id = $1" : ""} order by updated_at desc limit 1`, params);
  const drawers = [
    company && paths.includes("/companies") ? `/companies?open=${company}` : null,
    project && paths.includes("/projects") ? `/projects?open=${project}` : null,
    quotation && paths.includes("/quotations") ? `/quotations?open=${quotation}` : null,
    dispatch && paths.includes("/dispatches") ? `/dispatches?open=${dispatch}` : null,
  ].filter((p): p is string => p !== null);
  return [...paths, ...drawers];
}

async function mark(text: string): Promise<void> {
  await pg.query(`select '${text}'`);
}

type LogLine = { app: string; db: string; text: string };
/**
 * The cluster as it was, and the sessions gone. Runs once however the process
 * ends: normally, on a throw, or on the interrupt that kills a run somebody is
 * watching go slowly.
 */
let putAway = false;
async function putBack(): Promise<void> {
  if (putAway) return;
  putAway = true;
  await pg.query("alter system reset log_min_duration_statement").catch(() => {});
  await pg.query("alter system reset log_line_prefix").catch(() => {});
  await pg.query("select pg_reload_conf()").catch(() => {});
  if (made.length) {
    await pg
      .query("delete from sessions where session_token = any($1)", [made])
      .catch(() => {});
  }
  await pg.end().catch(() => {});
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
  process.on(signal, () => {
    void putBack().then(() => process.exit(130));
  });
}

function readLog(since: string): LogLine[] {
  // Postgres writes its log to the container's stderr; `docker logs` keeps the
  // two streams apart, so both are read and neither is let through to ours.
  const run = spawnSync("docker", ["logs", container, "--since", since], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.status !== 0) throw new Error(`docker logs failed: ${run.stderr.slice(0, 200)}`);
  const raw = run.stdout + run.stderr;
  // Prefix set below: `%m [%p] %d %a ` → "2026-09-07 10:00:00.000 +03 [123] kladra next-start LOG: ..."
  return raw.split(/\r?\n/).flatMap((line) => {
    const m = /^\S+ \S+ \S+ \[\d+\] (\S+) (\S*) (LOG|ERROR|STATEMENT|DETAIL):\s+(.*)$/.exec(line);
    return m ? [{ db: m[1], app: m[2], text: m[4] }] : [];
  });
}

function cut(lines: LogLine[], role: Role, path: string): Measure {
  const start = lines.findIndex((l) => l.app === APP_NAME && l.text.includes(`kladra-mark start ${role} ${path} `));
  const end = lines.findIndex((l, i) => i > start && l.app === APP_NAME && l.text.includes(`kladra-mark end ${role} ${path} `));
  const inside = start >= 0 && end > start ? lines.slice(start + 1, end) : [];
  let statements = 0;
  let dbMs = 0;
  let worstMs = 0;
  let worst = "";
  for (const l of inside) {
    if (l.app === APP_NAME || l.db !== dbName) continue;
    const m = /^duration: ([\d.]+) ms\s+(execute [^:]+|statement): (.*)$/.exec(l.text);
    if (!m) continue;
    const ms = Number(m[1]);
    statements += 1;
    dbMs += ms;
    if (ms > worstMs) {
      worstMs = ms;
      worst = m[3].replace(/\s+/g, " ").slice(0, 90);
    }
  }
  return { role, path, statements, dbMs: Math.round(dbMs * 10) / 10, worstMs, worst };
}

const made: string[] = [];
const measures: Measure[] = [];
const refused: string[] = [];
const since = new Date().toISOString();
try {
  await health();
  await pg.query("alter system set log_min_duration_statement = 0");
  await pg.query("alter system set log_line_prefix = '%m [%p] %d %a '");
  await pg.query("select pg_reload_conf()");
  // The reload is asynchronous; the first marker must land after it.
  await new Promise((r) => setTimeout(r, 500));

  const planned: { role: Role; path: string; cookie: string }[] = [];
  for (const persona of PERSONAS) {
    const session = await sessionFor(persona.email);
    made.push(session.token);
    for (const path of await screensFor(persona.role, session.userId)) {
      planned.push({ role: persona.role, path, cookie: session.cookie });
    }
  }

  for (const { role, path, cookie } of planned) {
    // A warm-up first: the first request after boot compiles nothing on a
    // production build, but it does open the pool's connections.
    await mark(`kladra-mark start ${role} ${path} `);
    const res = await fetch(`${origin}/en${path}`, {
      headers: { cookie, accept: "text/html" },
      redirect: "manual",
    });
    await res.text();
    if (res.status !== 200) {
      // A screen that did not draw asks nothing, and a count of nothing must
      // never read as an improvement.
      refused.push(`${role} ${path} answered ${res.status}`);
    }
    await mark(`kladra-mark end ${role} ${path} `);
  }

  await new Promise((r) => setTimeout(r, 300));
  const lines = readLog(since);
  for (const { role, path } of planned) measures.push(cut(lines, role, path));
} finally {
  await putBack();
}

// Nothing to compare is not a pass: a screen that answered with an error, or
// one whose markers never reached the log, would otherwise be a zero and read
// as the best figure in the table.
const empty = measures.filter((m) => m.statements === 0).map((m) => `${m.role} ${m.path}`);
if (refused.length || empty.length) {
  for (const line of refused) console.error(`refused: ${line}`);
  for (const line of empty) console.error(`no statements measured: ${line}`);
  console.error("\nThe run did not measure what it says it measured; nothing is written or checked.");
  process.exit(1);
}

const total = measures.reduce((n, m) => n + m.statements, 0);
const width = Math.max(...measures.map((m) => m.path.length));
console.log(`${measures.length} screens, ${total} statements, ${origin}, database ${dbName}\n`);
console.log(`${"role".padEnd(12)} ${"screen".padEnd(width)}  stmts   db ms   worst ms  worst statement`);
for (const m of measures) {
  console.log(
    `${m.role.padEnd(12)} ${m.path.padEnd(width)}  ${String(m.statements).padStart(5)}  ${String(m.dbMs).padStart(6)}  ${String(m.worstMs).padStart(8)}  ${m.worst}`,
  );
}

type Baseline = Record<string, number>;
const key = (m: Measure) => `${m.role} ${m.path.replace(/=[^&]+/g, "=<id>")}`;
if (args.has("write")) {
  const baseline: Baseline = {};
  for (const m of measures) baseline[key(m)] = m.statements;
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\nbaseline written to ${baselinePath}`);
} else if (args.has("check")) {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
  const grown = measures.filter((m) => key(m) in baseline && m.statements > baseline[key(m)]);
  const unknown = measures.filter((m) => !(key(m) in baseline));
  for (const m of grown) console.error(`grew: ${key(m)} ${baseline[key(m)]} → ${m.statements}`);
  for (const m of unknown) console.error(`not in the baseline: ${key(m)} (${m.statements})`);
  if (grown.length || unknown.length) {
    console.error("\nA screen may not ask more than its baseline without a sentence in WORKFLOW §3 saying why; then --write.");
    process.exit(1);
  }
  console.log("\nreads — no screen asks more than its baseline");
}
