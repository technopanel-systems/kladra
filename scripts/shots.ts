/**
 * The "before" (and later "after") screenshot set of the whole front end
 * (WORKFLOW G1 · S1). One manifest, every state a role can reach, shot at both
 * widths, both locales and both themes — so a redesign has something to stand
 * beside.
 *
 * `npx tsx scripts/shots.ts --label=before [--only=<role__state>,…] [--widths=1366,375]`
 *
 * `SHOTS_PORT=3106` points it at another dev server — a worktree's, say — on loopback.
 *
 * Never against anything but a dev server on loopback (3100 unless `SHOTS_PORT`
 * says otherwise): every navigation is checked against that host before it is trusted,
 * and nothing here ever presses Save, Submit, Issue, Approve or Archive — a
 * dialog or a drawer is opened and left exactly there.
 *
 * One browser context per identity, signed in once through the real form at
 * `/en/login` (fields by label, the submit button scoped to `main form`), and
 * reused for every state that identity reaches; a fresh page for every single
 * capture, so one capture's half-open menu can never bleed into the next.
 *
 * The theme is a cookie the server reads (`src/lib/theme.ts`), set on the
 * context before each capture; the locale is the URL prefix `next-intl`
 * already requires (`localePrefix: "always"`). Every state below names its
 * own view, tab or filter in the URL — never a bare path — because the app
 * remembers the last one a person chose (SPEC §3) and a bare path would show
 * whatever they had left it on last time this ran.
 *
 * Every trigger is found by the word the screen itself shows, read out of
 * `messages/en/*.json` and `messages/ar/*.json` at run time — never typed
 * twice — so the same manifest drives both locales and an "after" run reuses
 * it unchanged.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { isolatePlaceholders } from "../src/i18n/isolate";

const PORT = process.env.SHOTS_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const PASSWORD = "kladra2026";
const LOCALES = ["en", "ar"] as const;
const THEMES = ["dark", "light"] as const;
type Locale = (typeof LOCALES)[number];
type Theme = (typeof THEMES)[number];

const VIEWPORTS: Record<number, { width: number; height: number }> = {
  1366: { width: 1366, height: 900 },
  375: { width: 375, height: 812 },
};

type Identity = "anonymous" | "rep" | "coordinator" | "manager" | "admin" | "marketing";

const IDENTITIES: Record<Exclude<Identity, "anonymous">, string> = {
  rep: "faisal@technopanel.com.sa",
  coordinator: "rawan@technopanel.com.sa",
  manager: "abdulrahman@technopanel.com.sa",
  admin: "jerom@technopanel.com.sa",
  marketing: "marketing@technopanel.com.sa",
};

/* -------------------------------------------------------------------------- */
/* Messages — read once, looked up by "<namespace>.<key>" the way the app     */
/* itself does, so a trigger's label is never retyped by hand.                */
/* -------------------------------------------------------------------------- */

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix: string, out: Map<string, string>): void {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else flatten(value, path, out);
  }
}

function loadLocale(locale: string): Map<string, string> {
  const dir = resolve(import.meta.dirname, "..", "messages", locale);
  const out = new Map<string, string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const tree = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Tree;
    flatten(tree, file.slice(0, -".json".length), out);
  }
  return out;
}

const MESSAGES: Record<Locale, Map<string, string>> = {
  en: loadLocale("en"),
  ar: loadLocale("ar"),
};

function rawMessage(locale: Locale, key: string): string {
  const value = MESSAGES[locale].get(key);
  if (value === undefined) throw new Error(`Missing message "${key}" for locale "${locale}"`);
  return value;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

type Tr = (key: string, params?: Record<string, string | number>) => string;
type PrefixOf = (key: string) => string;

/** A value in a message is isolated on screen (`src/i18n/isolate.ts`, words.md),
 *  so the text an exact match looks for carries the same isolates. */
function trFor(locale: Locale): Tr {
  return (key, params) => interpolate(isolatePlaceholders(rawMessage(locale, key)), params);
}

/** The literal text before a template's first `{placeholder}` — for matching
 *  an accessible name that carries a value this script does not know ahead of
 *  time (a person's name, a company's). */
function prefixFor(locale: Locale): PrefixOf {
  return (key) => rawMessage(locale, key).split("{")[0];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* -------------------------------------------------------------------------- */
/* The manifest                                                               */
/* -------------------------------------------------------------------------- */

type Step = (page: Page, T: Tr, prefix: PrefixOf, width: number) => Promise<void>;
type Wait = (page: Page, T: Tr, prefix: PrefixOf, width: number) => Promise<void>;

type StateDef = {
  /** The manifest's own grouping — the filename's first segment. */
  role: string;
  /** The state's own name — the filename's second segment. */
  key: string;
  /** Which signed-in context drives it. */
  identity: Identity;
  /** Locale-free path, query included — e.g. "/day?tab=work". Never bare. */
  path: string;
  /** What proves the state is actually drawn, run after `steps`. */
  waitFor: Wait;
  /** What reaches the state from the page named by `path`. */
  steps?: Step;
};

function chain(...steps: Step[]): Step {
  return async (page, T, prefix, width) => {
    for (const step of steps) await step(page, T, prefix, width);
  };
}

/** A heading (any level) with this exact translated text. */
function heading(key: string, params?: Record<string, string | number>): Wait {
  return async (page, T) => {
    await page
      .getByRole("heading", { name: T(key, params), exact: true })
      .first()
      .waitFor({ state: "visible" });
  };
}

/** Any element carrying this exact translated text — a section title, a chip,
 *  a sentence known to appear only once the state is real. */
function textVisible(key: string, params?: Record<string, string | number>): Wait {
  return async (page, T) => {
    await page.getByText(T(key, params), { exact: true }).first().waitFor({ state: "visible" });
  };
}

/** A dialog or drawer (both render through Radix's Dialog primitive, so both
 *  answer to `role="dialog"`) carrying this exact translated text somewhere
 *  inside it — proof the async lookups it opened on have already resolved. */
function dialogWithText(key: string, params?: Record<string, string | number>): Wait {
  return async (page, T) => {
    const dialog = page.getByRole("dialog").first();
    await dialog.waitFor({ state: "visible" });
    await dialog.getByText(T(key, params), { exact: true }).first().waitFor({ state: "visible" });
  };
}

function dialogVisible(): Wait {
  return async (page) => {
    await page.getByRole("dialog").first().waitFor({ state: "visible" });
  };
}

function menuVisible(): Wait {
  return async (page) => {
    await page.getByRole("menu").first().waitFor({ state: "visible" });
  };
}

/** The first row of whichever list is on screen — desktop table or phone
 *  card, both real `<a>` elements, so `:visible` alone tells them apart. */
function openFirstRow(paramName = "open"): Step {
  return async (page) => {
    await page
      .locator(`a[href*="${paramName}="]:visible`)
      .first()
      .click();
  };
}

function clickButton(key: string, params?: Record<string, string | number>): Step {
  return async (page, T) => {
    await page.getByRole("button", { name: T(key, params), exact: true }).first().click();
  };
}

/** A button whose accessible name carries a value this script does not know
 *  ahead of time (a company's name, a person's) — matched by the fixed words
 *  the message starts with. */
function clickButtonByPrefix(key: string): Step {
  return async (page, T, prefix) => {
    const pattern = new RegExp(`^${escapeRegExp(prefix(key))}`);
    await page.getByRole("button", { name: pattern }).first().click();
  };
}

function pressKeys(keys: string): Step {
  return async (page) => {
    await page.keyboard.press(keys);
  };
}

/** One of the kit's searchable comboboxes (`SearchableSelect`): open it and
 *  take its first offered row — enough to show a field filled, never a
 *  particular value. */
function pickCombobox(key: string): Step {
  return async (page, T) => {
    const combo = page.getByRole("combobox", { name: T(key), exact: true }).first();
    await combo.click();
    await page.getByRole("option").first().click();
  };
}

function fillField(key: string, value: string): Step {
  return async (page, T) => {
    await page.getByLabel(T(key), { exact: true }).fill(value);
  };
}

const MANIFEST: StateDef[] = [
  /* ---------------------------- signed-out --------------------------- */
  {
    role: "signed-out",
    key: "login",
    identity: "anonymous",
    path: "/login",
    waitFor: async (page, T) => {
      await page.locator("main form").waitFor({ state: "visible" });
      await page
        .getByRole("button", { name: T("auth.signIn"), exact: true })
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "signed-out",
    key: "missing",
    identity: "rep",
    path: "/no-such-screen",
    waitFor: heading("shell.missingTitle"),
  },

  /* --------------------------------- rep ------------------------------ */
  { role: "rep", key: "day-work", identity: "rep", path: "/day?tab=work", waitFor: textVisible("day.whoToCall") },
  {
    role: "rep",
    key: "day-metrics",
    identity: "rep",
    path: "/day?tab=metrics",
    waitFor: textVisible("common.range.month"),
  },
  { role: "rep", key: "companies", identity: "rep", path: "/companies", waitFor: heading("common.companies") },
  {
    role: "rep",
    key: "companies-empty",
    identity: "rep",
    path: "/companies?q=zzzzqqq",
    waitFor: textVisible("shell.searchNoResults", { q: "zzzzqqq" }),
  },
  {
    role: "rep",
    key: "company-drawer",
    identity: "rep",
    path: "/companies",
    steps: openFirstRow("open"),
    waitFor: dialogWithText("drawer.activity"),
  },
  {
    role: "rep",
    key: "company-add",
    identity: "rep",
    path: "/companies",
    steps: clickButton("forms.addCompany"),
    waitFor: dialogWithText("forms.contactHeading"),
  },
  {
    role: "rep",
    key: "report-dialog",
    identity: "rep",
    path: "/day?tab=work",
    steps: clickButtonByPrefix("reports.addFor"),
    waitFor: dialogWithText("reports.dialog.kind"),
  },
  {
    role: "rep",
    key: "projects",
    identity: "rep",
    path: "/projects?view=list",
    waitFor: heading("common.projects"),
  },
  {
    role: "rep",
    key: "projects-board",
    identity: "rep",
    path: "/projects?view=board",
    waitFor: textVisible("projects.stageDispatching"),
  },
  {
    role: "rep",
    key: "project-drawer",
    identity: "rep",
    path: "/projects",
    steps: openFirstRow("open"),
    waitFor: dialogWithText("drawer.activity"),
  },
  {
    role: "rep",
    key: "project-new",
    identity: "rep",
    path: "/projects",
    steps: clickButton("projects.newProject"),
    waitFor: dialogWithText("common.pickCompany"),
  },
  {
    role: "rep",
    key: "quotations-list",
    identity: "rep",
    path: "/quotations?view=list",
    waitFor: heading("common.quotations"),
  },
  {
    role: "rep",
    key: "quotations-board",
    identity: "rep",
    path: "/quotations?view=board",
    waitFor: textVisible("quotations.statusRequested"),
  },
  {
    role: "rep",
    key: "quotation-drawer",
    identity: "rep",
    path: "/quotations?view=list",
    steps: openFirstRow("open"),
    waitFor: dialogWithText("common.raisedBy"),
  },
  {
    role: "rep",
    key: "quotation-request",
    identity: "rep",
    path: "/quotations?view=list",
    steps: chain(
      clickButton("quotations.request"),
      pickCombobox("common.company"),
      pickCombobox("common.project"),
      fillField("common.colourCode", "168"),
      pickCombobox("common.supplier"),
      pickCombobox("common.fireRating"),
      pickCombobox("common.class"),
      fillField("common.pricePerSqm", "50"),
    ),
    waitFor: dialogWithText("common.company"),
  },
  {
    role: "rep",
    key: "dispatches-list",
    identity: "rep",
    path: "/dispatches?view=list",
    waitFor: heading("common.dispatches"),
  },
  {
    role: "rep",
    key: "dispatches-board",
    identity: "rep",
    path: "/dispatches?view=board",
    waitFor: textVisible("dispatches.statusSubmitted"),
  },
  {
    role: "rep",
    key: "dispatch-drawer",
    identity: "rep",
    path: "/dispatches?view=list",
    steps: openFirstRow("open"),
    waitFor: dialogVisible(),
  },
  {
    role: "rep",
    key: "dispatch-request",
    identity: "rep",
    path: "/dispatches?view=list",
    steps: clickButton("dispatches.request"),
    waitFor: dialogWithText("dispatches.pickQuotationFirst"),
  },
  { role: "rep", key: "reports", identity: "rep", path: "/reports", waitFor: heading("reports.title") },
  {
    role: "rep",
    key: "notifications",
    identity: "rep",
    path: "/notifications",
    waitFor: heading("common.notifications"),
  },
  {
    role: "rep",
    key: "search-palette",
    identity: "rep",
    path: "/day?tab=work",
    steps: pressKeys("Control+k"),
    waitFor: async (page, T) => {
      await page.getByRole("dialog").first().waitFor({ state: "visible" });
      await page.getByPlaceholder(T("common.searchPlaceholder")).first().waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "user-menu",
    identity: "rep",
    path: "/day?tab=work",
    steps: clickButtonByPrefix("shell.accountMenuFor"),
    waitFor: menuVisible(),
  },

  /* ----------------------------- coordinator --------------------------- */
  { role: "coordinator", key: "queue", identity: "coordinator", path: "/queue", waitFor: heading("common.queue") },
  {
    role: "coordinator",
    key: "queue-quotation",
    identity: "coordinator",
    path: "/queue",
    steps: openFirstRow("open"),
    waitFor: dialogWithText("common.raisedBy"),
  },
  {
    role: "coordinator",
    key: "queue-dispatch",
    identity: "coordinator",
    path: "/queue",
    steps: openFirstRow("dispatch"),
    waitFor: dialogVisible(),
  },
  {
    role: "coordinator",
    key: "day-work",
    identity: "coordinator",
    path: "/day?tab=work",
    waitFor: textVisible("day.whoToCall"),
  },

  /* ------------------------------- manager ------------------------------ */
  {
    role: "manager",
    key: "team-work",
    identity: "manager",
    path: "/team?tab=work",
    waitFor: textVisible("team.pipeline"),
  },
  {
    role: "manager",
    key: "team-metrics",
    identity: "manager",
    path: "/team?tab=metrics",
    waitFor: textVisible("common.range.month"),
  },
  {
    role: "manager",
    key: "team-team",
    identity: "manager",
    path: "/team?tab=team",
    waitFor: heading("shell.team"),
  },
  {
    role: "manager",
    key: "duplicates",
    identity: "manager",
    path: "/duplicates",
    waitFor: heading("duplicates.title"),
  },
  { role: "manager", key: "leads", identity: "manager", path: "/leads", waitFor: heading("leads.title") },

  /* -------------------------------- admin -------------------------------- */
  { role: "admin", key: "admin-users", identity: "admin", path: "/admin/users", waitFor: heading("common.users") },
  {
    role: "admin",
    key: "admin-targets",
    identity: "admin",
    path: "/admin/targets",
    waitFor: heading("common.targets"),
  },
  {
    role: "admin",
    key: "admin-lookups",
    identity: "admin",
    path: "/admin/lookups",
    waitFor: heading("common.lookups"),
  },
  {
    role: "admin",
    key: "admin-holidays",
    identity: "admin",
    path: "/admin/holidays",
    waitFor: heading("common.holidays"),
  },
  { role: "admin", key: "admin-use", identity: "admin", path: "/admin/use", waitFor: heading("admin.use") },
  {
    role: "admin",
    key: "admin-archive",
    identity: "admin",
    path: "/admin/archive",
    waitFor: heading("admin.archive"),
  },
  {
    role: "admin",
    key: "admin-export",
    identity: "admin",
    path: "/admin/export",
    waitFor: heading("common.export"),
  },

  /* ------------------------------ marketing ------------------------------ */
  { role: "marketing", key: "leads", identity: "marketing", path: "/leads", waitFor: heading("leads.title") },
  {
    role: "marketing",
    key: "lead-new",
    identity: "marketing",
    path: "/leads",
    steps: clickButton("leads.new"),
    waitFor: dialogWithText("leads.new"),
  },
  {
    role: "marketing",
    key: "day-work",
    identity: "marketing",
    path: "/day?tab=work",
    waitFor: textVisible("day.whoToCall"),
  },
];

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `<Hydrated>` in the root layout stamps `html[data-hydrated]` once React has
 * taken over the server-rendered HTML (src/components/shell/hydrated.tsx);
 * the specs wait for the same thing (tests/helpers/i18n.ts). A screen is on
 * the page and readable well before it is live, and a trigger clicked in
 * between does nothing at all — no error, no dialog — which read as a dead
 * manifest entry until this waited for hydration like the real suite does.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

function assertHost(page: Page): void {
  const host = new URL(page.url()).host;
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`refusing to capture — unexpected host "${host}" (${page.url()})`);
  }
}

async function signIn(context: BrowserContext, email: string): Promise<void> {
  const page = await context.newPage();
  try {
    const T = trFor("en");
    await page.goto(`${BASE}/en/login`, { waitUntil: "load" });
    assertHost(page);
    await waitForHydration(page);
    await page.getByLabel(T("auth.email"), { exact: true }).fill(email);
    await page.getByLabel(T("auth.password"), { exact: true }).fill(PASSWORD);
    await page
      .locator("main form")
      .getByRole("button", { name: T("auth.signIn"), exact: true })
      .click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  } finally {
    await page.close();
  }
}

async function getContext(
  browser: Browser,
  cache: Map<Identity, BrowserContext>,
  identity: Identity,
): Promise<BrowserContext> {
  const cached = cache.get(identity);
  if (cached) return cached;
  const context = await browser.newContext();
  if (identity !== "anonymous") await signIn(context, IDENTITIES[identity]);
  cache.set(identity, context);
  return context;
}

function parseArgs(argv: string[]): { label: string; only: string | null; widths: number[] } {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }
  const widths = (args.get("widths") ?? "1366,375")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    label: args.get("label") ?? "before",
    only: args.get("only") ?? null,
    widths: widths.length > 0 ? widths : [1366, 375],
  };
}

async function main(): Promise<void> {
  const { label, only, widths } = parseArgs(process.argv.slice(2));

  try {
    const health = await fetch(`${BASE}/api/health`);
    if (!health.ok) throw new Error(`status ${health.status}`);
  } catch (error) {
    console.error(
      `The dev server at ${BASE} is not answering /api/health (${(error as Error).message}). ` +
        `Start it (npm run dev) and wait for it before running this script.`,
    );
    process.exitCode = 1;
    return;
  }

  const outDir = resolve(import.meta.dirname, "..", "shots", label);
  mkdirSync(outDir, { recursive: true });

  const wanted = only ? only.split(",") : null;
  const states = MANIFEST.filter((state) => !wanted || wanted.includes(`${state.role}__${state.key}`));
  if (states.length === 0) {
    console.error(`--only=${only} matched nothing in the manifest.`);
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();
  const contexts = new Map<Identity, BrowserContext>();

  let captured = 0;
  const failures: string[] = [];

  for (const state of states) {
    let context: BrowserContext;
    try {
      context = await getContext(browser, contexts, state.identity);
    } catch (error) {
      for (const width of widths) {
        for (const locale of LOCALES) {
          for (const theme of THEMES) {
            failures.push(
              `${state.role}__${state.key}__${width}__${locale}__${theme}: could not sign in as ` +
                `"${state.identity}": ${(error as Error).message}`,
            );
          }
        }
      }
      continue;
    }

    for (const width of widths) {
      const viewport = VIEWPORTS[width] ?? { width, height: Math.round(width * 1.19) };

      for (const locale of LOCALES) {
        for (const theme of THEMES) {
          const name = `${state.role}__${state.key}__${width}__${locale}__${theme}`;
          let page: Page | null = null;
          try {
            await context.addCookies([{ url: BASE, name: "theme", value: theme }]);
            page = await context.newPage();
            page.setDefaultTimeout(30_000);
            await page.setViewportSize(viewport);

            const T = trFor(locale);
            const prefix = prefixFor(locale);

            await page.goto(`${BASE}/${locale}${state.path}`, { waitUntil: "load" });
            assertHost(page);
            await waitForHydration(page);

            if (state.steps) await state.steps(page, T, prefix, viewport.width);
            await state.waitFor(page, T, prefix, viewport.width);
            assertHost(page);

            await page.waitForTimeout(400);
            await page.screenshot({ path: resolve(outDir, `${name}.png`) });
            captured += 1;
          } catch (error) {
            failures.push(`${name}: ${(error as Error).message}`);
          } finally {
            if (page) await page.close().catch(() => {});
          }
        }
      }
    }
  }

  await browser.close();

  writeFileSync(
    resolve(outDir, "failures.txt"),
    failures.length > 0 ? failures.join("\n") + "\n" : "",
  );

  console.log(`shots: captured ${captured}, failed ${failures.length} (label "${label}")`);
  if (failures.length > 0) {
    console.log(`see ${resolve(outDir, "failures.txt")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
