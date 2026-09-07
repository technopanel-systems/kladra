/**
 * First paint on a mid phone, measured — the repeatable form of "is it fast on
 * a rep's phone" (WORKFLOW §0 box 11I, §3 "Speed, measured").
 *
 *   npx tsx scripts/speed.ts                       # against 3102, the production build
 *   npx tsx scripts/speed.ts --origin http://127.0.0.1:3102 --runs 3
 *   npx tsx scripts/speed.ts --write               # rewrite scripts/speed.baseline.json
 *   npx tsx scripts/speed.ts --check               # exit 1 when a screen is slower than its ceiling
 *
 * A mid phone is Chromium with the CPU slowed four times and the network held
 * to a slow 4G (1.6 Mb/s down, 750 kb/s up, 150 ms each way) — the numbers
 * Lighthouse uses for "mobile", so a figure here can be compared with one
 * anyone else measures. Viewport 375 by 812, touch, a cold context per screen
 * (no cache, no service worker) and a warm one after it, both reported.
 *
 * Four figures per screen: first contentful paint, largest contentful paint,
 * the moment React took the page over (`html[data-hydrated]`, the same mark the
 * suite waits for), and the bytes that crossed the wire as the page's own
 * resource timing counts them (transferSize — a cache hit is 0, which is the
 * point of the warm column). Medians over `--runs`.
 *
 * Cold means cold: the sign-in happens in one context and only its cookie is
 * carried into a fresh one for the load, so the shared chunks and fonts the
 * sign-in page pulled are not sitting in the cache (the first cut measured a
 * "cold" day screen at 65 kB for exactly that reason).
 *
 * Browser-side code here — the init script and the evaluate — has no named
 * inner functions on purpose. tsx runs esbuild with keepNames, which wraps
 * every named function in a `__name(...)` helper the browser does not have,
 * and an init script that throws does so silently: the first cut read the
 * hydration mark as 0 because `const watch = () => …` threw before the
 * observer was installed. Functions are passed inline, or not written.
 *
 * It needs the production server up — `npx next start -H 127.0.0.1 -p 3102` —
 * and does not start or stop anything itself (3102 must be down before
 * `npm run build`, and a script that starts servers is how that is forgotten).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Cookie, type Page } from "@playwright/test";
import { loadEnv } from "../src/lib/env";

loadEnv();

// `--runs 3` and `--runs=3` both mean three. The space form used to make the
// value the string "true", `Number("true")` NaN, and the loop run zero times —
// leaving a table of empty cells that `--check` read as "nothing got slower"
// and `--write` saved as a baseline of `{}`, a dead guard nobody would notice.
// Anything not understood stops the run rather than being ignored.
const FLAGS = ["origin", "runs", "write", "check"];
const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (!arg.startsWith("--")) throw new Error(`speed: ${arg} is not an option (${FLAGS.join(", ")})`);
  const [key, value] = arg.replace(/^--/, "").split("=");
  if (!FLAGS.includes(key)) throw new Error(`speed: --${key} is not an option (${FLAGS.join(", ")})`);
  const takesValue = key === "origin" || key === "runs";
  if (value !== undefined) args.set(key, value);
  else if (takesValue && argv[i + 1] && !argv[i + 1].startsWith("--")) {
    args.set(key, argv[i + 1]);
    i += 1;
  } else if (takesValue) throw new Error(`speed: --${key} needs a value`);
  else args.set(key, "true");
}
const origin = args.get("origin") ?? "http://127.0.0.1:3102";
const runs = Number(args.get("runs") ?? 3);
if (!Number.isInteger(runs) || runs < 1) throw new Error(`speed: --runs ${args.get("runs")}`);
const password = process.env.SEED_PASSWORD ?? "kladra2026";
const baselinePath = join(import.meta.dirname, "speed.baseline.json");

const PHONE = { width: 375, height: 812 };
const CPU_SLOWDOWN = 4;
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

const SCREENS: { who: string; email: string; paths: string[] }[] = [
  { who: "rep", email: "faisal@technopanel.com.sa", paths: ["/day", "/companies", "/quotations"] },
  { who: "coordinator", email: "rawan@technopanel.com.sa", paths: ["/queue", "/quotations"] },
  { who: "manager", email: "abdulrahman@technopanel.com.sa", paths: ["/team", "/companies"] },
];

type Figures = {
  fcp: number;
  lcp: number;
  hydrated: number;
  bytes: number;
  document: number;
  script: number;
};
type Row = { who: string; path: string; cold: Figures; warm: Figures };

async function health(): Promise<void> {
  const res = await fetch(`${origin}/api/health`).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(`${origin} is not answering — start the production build first (see the header).`);
  }
}

async function slow(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
}

/** Signs in through the real form in a throwaway context and hands back the cookies. */
async function signIn(context: BrowserContext, email: string): Promise<Cookie[]> {
  const page = await context.newPage();
  await page.goto(`${origin}/en/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 60_000 });
  await page.close();
  return context.cookies();
}

/** One load of one screen on a slowed page; the context must already carry the session. */
async function measure(page: Page, path: string): Promise<Figures> {
  await page.goto(`${origin}/en${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", null, {
    timeout: 90_000,
    polling: 250,
  });
  // LCP settles after the last large element paints; give the observer a beat.
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const paint = performance.getEntriesByType("paint");
    const fcp = paint.find((e) => e.name === "first-contentful-paint")?.startTime ?? 0;
    const w = window as unknown as { __lcp?: number; __hydrated?: number };
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const doc = nav?.transferSize ?? 0;
    let script = 0;
    let rest = 0;
    for (const r of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      if (r.name.endsWith(".js")) script += r.transferSize;
      else rest += r.transferSize;
    }
    return {
      fcp: Math.round(fcp),
      lcp: Math.round(w.__lcp ?? 0),
      hydrated: Math.round(w.__hydrated ?? 0),
      bytes: doc + script + rest,
      document: doc,
      script,
    };
  });
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const fold = (all: Figures[]): Figures => ({
  fcp: median(all.map((f) => f.fcp)),
  lcp: median(all.map((f) => f.lcp)),
  hydrated: median(all.map((f) => f.hydrated)),
  bytes: median(all.map((f) => f.bytes)),
  document: median(all.map((f) => f.document)),
  script: median(all.map((f) => f.script)),
});

await health();
const browser = await chromium.launch();
const rows: Row[] = [];
try {
  for (const { who, email, paths } of SCREENS) {
    for (const path of paths) {
      const cold: Figures[] = [];
      const warm: Figures[] = [];
      for (let i = 0; i < runs; i += 1) {
        const lobby = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
        const cookies = await signIn(lobby, email);
        await lobby.close();
        const context = await browser.newContext({
          viewport: PHONE,
          hasTouch: true,
          isMobile: true,
          serviceWorkers: "block",
        });
        await context.addCookies(cookies);
        const page = await context.newPage();
        // Both watchers have to be in place before the document starts: LCP
        // reaches a PerformanceObserver only, and the hydration mark is the
        // moment `html[data-hydrated]` appears (src/components/shell/hydrated.tsx).
        // The root element does not exist yet when this runs; the document node
        // does, and a subtree observer on it sees the attribute land on <html>.
        await page.addInitScript(() => {
          const w = window as unknown as { __lcp: number; __hydrated: number };
          w.__lcp = 0;
          w.__hydrated = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) w.__lcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new MutationObserver(() => {
            if (!w.__hydrated && document.documentElement?.dataset.hydrated === "true") {
              w.__hydrated = performance.now();
            }
          }).observe(document, {
            attributes: true,
            attributeFilter: ["data-hydrated"],
            subtree: true,
          });
        });
        await slow(page);
        const c = await measure(page, path);
        const w = await measure(page, path);
        cold.push(c);
        warm.push(w);
        // Progress on stderr, so a run that dies still leaves its figures.
        console.error(
          `${who} ${path} ${i + 1}/${runs}: cold hydrated ${c.hydrated} ms, ${Math.round(c.bytes / 1024)} kB · warm ${w.hydrated} ms, ${Math.round(w.bytes / 1024)} kB`,
        );
        await context.close();
      }
      rows.push({ who, path, cold: fold(cold), warm: fold(warm) });
    }
  }
} finally {
  await browser.close();
}

console.log(`\nmid phone: CPU ×${CPU_SLOWDOWN}, slow 4G, 375×812, medians of ${runs}, ${origin}\n`);
const kb = (n: number) => String(Math.round(n / 1024));
const cell = (value: number | string, width: number) => String(value).padStart(width);
console.log(
  "who          screen           FCP   LCP  hydrated  wire kB  doc kB  js kB |  warm FCP   LCP  hydrated  wire kB",
);
for (const r of rows) {
  const c = r.cold;
  const w = r.warm;
  console.log(
    `${r.who.padEnd(12)} ${r.path.padEnd(14)} ${cell(c.fcp, 5)} ${cell(c.lcp, 5)} ${cell(c.hydrated, 9)} ${cell(kb(c.bytes), 8)} ${cell(kb(c.document), 7)} ${cell(kb(c.script), 6)} | ${cell(w.fcp, 9)} ${cell(w.lcp, 5)} ${cell(w.hydrated, 9)} ${cell(kb(w.bytes), 8)}`,
  );
}

type Baseline = Record<string, { hydrated: number; bytes: number }>;
const key = (r: Row) => `${r.who} ${r.path}`;

// A figure that is not a number is a measurement that did not happen, and it
// must never reach the baseline or pass the check: silence is not speed.
const unmeasured = rows.filter(
  (r) => !Number.isFinite(r.cold.hydrated) || !Number.isFinite(r.cold.bytes),
);
if (rows.length === 0 || unmeasured.length) {
  for (const r of unmeasured) console.error(`not measured: ${key(r)}`);
  console.error(`\nspeed measured ${rows.length - unmeasured.length} of ${rows.length} screens.`);
  process.exit(1);
}
if (args.has("write")) {
  const baseline: Baseline = {};
  for (const r of rows) baseline[key(r)] = { hydrated: r.cold.hydrated, bytes: r.cold.bytes };
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\nbaseline written to ${baselinePath}`);
} else if (args.has("check")) {
  // A ceiling, not a target: a fifth slower or a tenth heavier than the day it
  // was written is a regression somebody has to explain in WORKFLOW §3.
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
  const slower = rows.filter((r) => key(r) in baseline && r.cold.hydrated > baseline[key(r)].hydrated * 1.2);
  const heavier = rows.filter((r) => key(r) in baseline && r.cold.bytes > baseline[key(r)].bytes * 1.1);
  for (const r of slower) console.error(`slower: ${key(r)} hydrated ${baseline[key(r)].hydrated} → ${r.cold.hydrated} ms`);
  for (const r of heavier) console.error(`heavier: ${key(r)} ${Math.round(baseline[key(r)].bytes / 1024)} → ${Math.round(r.cold.bytes / 1024)} kB`);
  if (slower.length || heavier.length) process.exit(1);
  console.log("\nspeed — no screen is slower or heavier than its baseline");
}
