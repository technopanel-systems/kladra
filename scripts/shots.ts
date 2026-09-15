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

/** The same, among what is drawn at this width only: a board names each stage
 *  twice — the phone's picker and the desk's column heading — and the first of
 *  the two in the document is hidden at 1366. */
function visibleText(key: string, params?: Record<string, string | number>): Wait {
  return async (page, T) => {
    await page
      .getByText(T(key, params), { exact: true })
      .filter({ visible: true })
      .first()
      .waitFor({ state: "visible" });
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

/** This translated text as part of a longer one: a dialog's description is
 *  its context line and its sentence in one element, so an exact match on the
 *  sentence alone never finds it. */
function textWithin(key: string): Wait {
  return async (page, T) => {
    await page.getByText(T(key)).first().waitFor({ state: "visible" });
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

/** The sign-in form's two fields, with Faisal's address and the given password. */
function typeCredentials(password: string): Step {
  return async (page, T) => {
    await page.getByLabel(T("auth.email"), { exact: true }).fill(IDENTITIES.rep);
    await page.getByLabel(T("auth.password"), { exact: true }).fill(password);
  };
}

function clickSignIn(): Step {
  return async (page, T) => {
    await page.locator("main form").getByRole("button", { name: T("auth.signIn"), exact: true }).click();
  };
}

/** A server action is a POST carrying `Next-Action`; everything else passes. */
async function serverActions(page: Page, answer: "hold" | "cut"): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.continue();
      return;
    }
    // Held: never answered, so whatever is waiting on it is caught waiting.
    if (answer === "cut") await route.abort("internetdisconnected");
  });
}

function holdServerActions(): Step {
  return (page) => serverActions(page, "hold");
}

/** The wire cut under the next server action: what a lobby with no signal does. */
function cutServerActions(): Step {
  return (page) => serverActions(page, "cut");
}

/**
 * The network of a lobby with one bar (S12.3): an answer that comes back a
 * trickle at a time, so a screen that streams in is caught while it is still
 * standing in for itself — its skeleton on the screen, the rest on the way.
 * Chromium's own throttle; nothing is refused and nothing is written.
 */
function slowNetwork(): Step {
  return async (page) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 1500,
      downloadThroughput: 4_000,
      uploadThroughput: -1,
    });
  };
}

/** From the open project drawer, its menu, and one item in it. */
function projectMenuItem(key: string): Step {
  return chain(clickButtonByPrefix("common.moreFor"), async (page, T) => {
    await page.getByRole("menuitem", { name: T(key), exact: true }).click();
  });
}

/**
 * A skeleton kept on screen after its answer arrives (S12.2), so it can be shot.
 *
 * A streamed fallback stands for as long as the server's queries take — three
 * hundred milliseconds against a seeded dev database — and nothing in the
 * browser can hold it: a held response shows the OLD screen, and a throttled
 * one arrives in one piece. So a watcher is set before the press: when React
 * takes the skeleton out, a copy goes back where it was and everything after it
 * in that container is hidden. What is shot is the skeleton's own markup, in
 * its own place, under the real shell. The page is closed after the capture.
 */
function keepSkeleton(selector: string): Step {
  return async (page) => {
    await page.evaluate((wanted) => {
      const style = document.createElement("style");
      style.textContent =
        "[data-kept-parent] > :not([data-kept-skeleton]) { display: none !important; }";
      document.head.append(style);
      new MutationObserver((records) => {
        if (document.querySelector("[data-kept-skeleton]")) return;
        for (const record of records) {
          for (const node of record.removedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            // The skeleton itself, or a wrapper React took out with it inside.
            const found = node.matches(wanted) ? node : node.querySelector(wanted);
            if (!found || !(record.target instanceof HTMLElement) || !record.target.isConnected) continue;
            const copy = found.cloneNode(true) as HTMLElement;
            copy.setAttribute("data-kept-skeleton", "");
            record.target.setAttribute("data-kept-parent", "");
            record.target.insertBefore(copy, record.target.firstChild);
            return;
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }, selector);
  };
}

/** A capture that starts at the top of a long phone page, brought to the part it is about. */
function scrollToSelector(selector: string): Step {
  return async (page) => {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
  };
}

/** The first row of the companies list itself — not a lead card in the band above it. */
function openFirstCompany(): Step {
  return async (page) => {
    await page.locator('[data-slot="company-list"] a[href*="open="]:visible').first().click();
  };
}

/** The company drawer's own menu, from the first row of the list behind it. */
function openCompanyMenu(): Step {
  return chain(openFirstCompany(), async (page, T, prefix, width) => {
    await dialogWithText("drawer.activity")(page, T, prefix, width);
    await page.getByRole("dialog").first().locator('[data-slot="row-menu"]').first().click();
  });
}

function chooseMenuItem(key: string): Step {
  return async (page, T) => {
    await page.getByRole("menuitem", { name: T(key), exact: true }).click();
  };
}

function typeInPalette(term: string): Step {
  return async (page) => {
    await page.getByRole("dialog").first().getByRole("combobox").fill(term);
  };
}

/**
 * From the team table, the person whose name matches: his id is on his row's
 * door (`/companies?rep=`), and the view-as cookie (src/lib/view-as.ts) is set
 * for the day's address in this locale only.
 */
function viewAsOnDay(name: RegExp): Step {
  return async (page) => {
    const href = await page.locator("a[href*='rep=']").filter({ hasText: name }).first().getAttribute("href");
    const id = href ? new URL(href, BASE).searchParams.get("rep") : null;
    if (!id) throw new Error(`no team row matching ${name}`);
    const url = new URL(page.url());
    const locale = url.pathname.split("/")[1];
    await page.context().addCookies([
      { name: "kladra-view-as", value: id, domain: url.hostname, path: `/${locale}/day` },
    ]);
    await page.goto(`${BASE}/${locale}/day?tab=work`, { waitUntil: "load" });
    assertHost(page);
    await waitForHydration(page);
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
  // The three answers the sign-in form can give before it lets anybody in
  // (S12.1). None of them signs anybody in: the address is Faisal's and the
  // password is not, or the request never reaches the server.
  {
    role: "signed-out",
    key: "login-busy",
    identity: "anonymous",
    path: "/login",
    // The answer is held back, so the button is caught while it works.
    steps: chain(holdServerActions(), typeCredentials("not the password"), clickSignIn()),
    waitFor: async (page, T) => {
      await page
        .getByRole("button", { name: T("auth.signingIn"), exact: true })
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "signed-out",
    key: "login-wrong",
    identity: "anonymous",
    path: "/login",
    steps: chain(typeCredentials("not the password"), clickSignIn()),
    waitFor: textVisible("auth.wrongCredentials"),
  },
  {
    role: "signed-out",
    key: "login-unreachable",
    identity: "anonymous",
    path: "/login",
    steps: chain(cutServerActions(), typeCredentials("not the password"), clickSignIn()),
    waitFor: textVisible("auth.unreachable"),
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
  /* The day's loading states (S12.6, S12.7): arriving from another screen, the
     title, the tabs and the work tab's shape; pressing Metrics, the tabs as they
     are and that tab's own shape under them. Both are held on screen by
     `keepSkeleton`, because a seeded dev database answers before a person could
     see either. */
  {
    role: "rep",
    key: "day-loading",
    identity: "rep",
    path: "/companies",
    steps: chain(keepSkeleton('[data-slot="work-skeleton"]'), async (page, T) => {
      await page.getByRole("link", { name: T("day.title"), exact: true }).first().click();
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="work-skeleton"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "day-metrics-loading",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(keepSkeleton('[data-slot="metrics-skeleton"]'), slowNetwork(), async (page, T) => {
      await page.getByRole("link", { name: T("common.tab.metrics"), exact: true }).first().click();
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="metrics-skeleton"]').waitFor({ state: "visible" });
    },
  },
  { role: "rep", key: "companies", identity: "rep", path: "/companies", waitFor: heading("common.companies") },
  {
    role: "rep",
    key: "companies-empty",
    identity: "rep",
    path: "/companies?q=zzzzqqq",
    // A rep who searches is already at the box, so the answer is under his
    // thumb; a shot that loads the address lands at the top of a long phone
    // page, and is brought to where he would be (S12.2).
    steps: scrollToSelector('[data-slot="company-list"]'),
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
  /* The companies screen's other states (S12.2): loading, filtered out, the
     drawer's menu and every dialog it opens, a refused add, the duplicate
     warning and a wire cut under Save. Nothing is confirmed: Save on an empty
     form is refused before anything is read, and the cut Save never arrives. */
  {
    role: "rep",
    key: "companies-loading",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(keepSkeleton('[data-slot="companies-skeleton"]'), async (page, T) => {
      await page.getByRole("link", { name: T("common.companies"), exact: true }).first().click();
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="companies-skeleton"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "companies-filtered",
    identity: "rep",
    // A search his floor answers, under a chip that hides every answer.
    path: "/companies?q=%D9%85%D8%A4%D8%B3%D8%B3%D8%A9&filter=today",
    steps: scrollToSelector('[data-slot="company-list"]'),
    waitFor: async (page, T) => {
      await page
        .locator('[data-slot="empty"]')
        .getByRole("link", { name: T("companies.clearFilter"), exact: true })
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "company-drawer-loading",
    identity: "rep",
    path: "/companies",
    // A drawer whose answer beats the first paint never draws its skeleton at
    // all, so the next row is tried, closed first, until one does.
    steps: chain(keepSkeleton('[data-slot="company-drawer-skeleton"]'), async (page) => {
      const skeleton = page.locator('[data-slot="company-drawer-skeleton"]');
      const rows = page.locator('[data-slot="company-list"] a[href*="open="]:visible');
      for (let index = 0; index < 6; index += 1) {
        await rows.nth(index).click();
        const seen = await skeleton
          .waitFor({ state: "visible", timeout: 3_000 })
          .then(() => true)
          .catch(() => false);
        if (seen) return;
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      }
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="company-drawer-skeleton"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "company-drawer-lead",
    identity: "rep",
    path: "/companies",
    steps: async (page) => {
      await page.locator('[data-slot="leads-band"] a[data-door]').first().click();
    },
    waitFor: async (page) => {
      await page.locator('[data-slot="lead-origin"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "company-drawer-gone",
    identity: "rep",
    path: "/companies?open=00000000-0000-4000-8000-000000000000",
    waitFor: dialogWithText("drawer.companyGone"),
  },
  {
    role: "rep",
    key: "company-menu",
    identity: "rep",
    path: "/companies",
    steps: openCompanyMenu(),
    waitFor: menuVisible(),
  },
  {
    role: "rep",
    key: "company-edit",
    identity: "rep",
    path: "/companies",
    steps: chain(openCompanyMenu(), chooseMenuItem("common.edit")),
    waitFor: async (page, T) => {
      await page
        .getByRole("dialog", { name: T("forms.editCompany"), exact: true })
        .getByRole("combobox", { name: T("common.category"), exact: true })
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "company-share",
    identity: "rep",
    path: "/companies",
    steps: chain(openCompanyMenu(), chooseMenuItem("drawer.share.action")),
    waitFor: textWithin("drawer.share.companyMeans"),
  },
  {
    role: "rep",
    key: "company-archive",
    identity: "rep",
    path: "/companies",
    steps: chain(openCompanyMenu(), chooseMenuItem("drawer.archive")),
    waitFor: dialogWithText("drawer.archiveWarning"),
  },
  {
    role: "rep",
    key: "company-contacts",
    identity: "rep",
    path: "/companies",
    steps: chain(openFirstCompany(), async (page, T) => {
      await page.getByRole("tab", { name: T("common.contacts"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page.locator("[data-contact]").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "company-add-contact",
    identity: "rep",
    path: "/companies",
    steps: chain(
      openFirstCompany(),
      async (page, T) => {
        await page.getByRole("tab", { name: T("common.contacts"), exact: true }).click();
      },
      clickButton("drawer.addContact"),
    ),
    waitFor: textWithin("forms.addContactHint"),
  },
  {
    role: "rep",
    key: "company-add-refused",
    identity: "rep",
    path: "/companies",
    steps: chain(clickButton("forms.addCompany"), async (page, T, prefix, width) => {
      await dialogWithText("forms.contactHeading")(page, T, prefix, width);
      await page.getByRole("dialog").getByRole("button", { name: T("common.save"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "company-add-duplicate",
    identity: "rep",
    path: "/companies",
    // One of his own customers' numbers, typed the way a rep types it.
    steps: chain(clickButton("forms.addCompany"), async (page, T, prefix, width) => {
      await dialogWithText("forms.contactHeading")(page, T, prefix, width);
      await page.getByRole("dialog").getByLabel(T("common.phone")).fill("0551204477");
    }),
    waitFor: async (page) => {
      const warning = page.getByRole("dialog").locator('[data-slot="open-match"]').first();
      await warning.waitFor({ state: "visible" });
      await warning.scrollIntoViewIfNeeded();
    },
  },
  {
    role: "rep",
    key: "company-add-offline",
    identity: "rep",
    path: "/companies",
    steps: chain(clickButton("forms.addCompany"), async (page, T, prefix, width) => {
      await dialogWithText("forms.contactHeading")(page, T, prefix, width);
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(T("common.company")).first().fill("Wire test — never saved");
      await cutServerActions()(page, T, prefix, width);
      await dialog.getByRole("button", { name: T("common.save"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page
        .getByRole("dialog")
        .locator('[data-slot="form-footer"] [role="alert"]')
        .waitFor({ state: "visible" });
    },
  },
  // Only the manager hands a company over (SPEC §3), and his own floor is the
  // one empty floor the seed has: first use, as the reader who adds nothing.
  {
    role: "manager",
    key: "company-hand-over",
    identity: "manager",
    path: "/companies",
    steps: chain(openCompanyMenu(), chooseMenuItem("drawer.handOver")),
    waitFor: textWithin("drawer.handOverWarning"),
  },
  {
    role: "manager",
    key: "companies-first-use",
    identity: "manager",
    path: "/team?tab=team",
    steps: async (page) => {
      await page.locator("a[href*='rep=']:visible").filter({ hasText: /Abdulrahman|عبدالرحمن/ }).first().click();
    },
    waitFor: async (page) => {
      await page.locator('[data-slot="empty"]').waitFor({ state: "visible" });
    },
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
    waitFor: visibleText("projects.stageDispatching"),
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
  /* The projects states S12.3 drew (P13-G6): both skeletons caught on a slow
     line, a chip hiding every project, a board with empty columns, the drawer's
     menu, a refused Add project, a refused Mark lost and Edit. Nothing is saved:
     the two refusals press the button on an empty form, which is refused before
     any action is asked. */
  {
    role: "rep",
    key: "projects-loading",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(slowNetwork(), async (page, T) => {
      await page.getByRole("link", { name: T("common.projects"), exact: true }).filter({ visible: true }).first().click();
    }),
    waitFor: async (page) => {
      await page.locator('main [role="status"][aria-busy="true"]').first().waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "project-drawer-loading",
    identity: "rep",
    path: "/projects?view=list",
    steps: chain(slowNetwork(), openFirstRow("open")),
    waitFor: async (page) => {
      await page.locator('[data-slot="sheet-content"][aria-busy="true"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "projects-filtered-out",
    identity: "rep",
    // Nothing of his is due today on the demo floor, so the chip hides it all.
    path: "/projects?view=list&filter=today",
    waitFor: textVisible("projects.showAll"),
  },
  {
    role: "rep",
    key: "projects-board-empty-column",
    identity: "rep",
    // One job matches, so four columns are empty; a phone opens on one of them.
    path: "/projects?view=board&q=Delta&stage=won",
    waitFor: async (page, T) => {
      await page
        .getByText(T("common.boardEmpty"), { exact: true })
        .filter({ visible: true })
        .first()
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "project-menu",
    identity: "rep",
    path: "/projects?view=list",
    steps: chain(openFirstRow("open"), clickButtonByPrefix("common.moreFor")),
    waitFor: menuVisible(),
  },
  {
    role: "rep",
    key: "project-new-refused",
    identity: "rep",
    path: "/projects?view=list",
    steps: chain(clickButton("projects.newProject"), async (page, T) => {
      await page.getByRole("dialog").getByRole("button", { name: T("common.save"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "project-mark-lost-refused",
    identity: "rep",
    path: "/projects?view=list",
    steps: chain(openFirstRow("open"), projectMenuItem("common.markLost"), async (page, T) => {
      await page
        .getByRole("dialog", { name: T("projects.markLostTitle"), exact: true })
        .getByRole("button", { name: T("common.markLost"), exact: true })
        .click();
    }),
    waitFor: async (page, T) => {
      await page
        .getByRole("dialog", { name: T("projects.markLostTitle"), exact: true })
        .getByRole("alert")
        .first()
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "project-edit",
    identity: "rep",
    path: "/projects?view=list",
    steps: chain(openFirstRow("open"), projectMenuItem("common.edit")),
    waitFor: async (page, T) => {
      await page
        .getByRole("dialog", { name: T("projects.editProject"), exact: true })
        .waitFor({ state: "visible" });
    },
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
    // The phone's stage picker names every state first and is hidden at 1366.
    waitFor: visibleText("quotations.statusRequested"),
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
  /* The quotations states S12.4 drew (P13-G6): the list and the drawer caught
     loading on a slow line, a chip hiding every row, the drawer of an issued, an
     accepted and a rejected paper, the customer's two answers and a revision
     opened from them, a refused request, and Withdraw from the drawer's menu.
     Nothing is confirmed: every dialog is opened and left, and the refused
     request is refused before any action is asked. */
  {
    role: "rep",
    key: "quotations-loading",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(slowNetwork(), async (page, T, prefix, width) => {
      // The rail on a desk; on a phone Quotations is in the bottom bar's menu.
      if (width < 768) {
        await page.getByRole("button", { name: T("common.menu"), exact: true }).click();
      }
      await page
        .getByRole("link", { name: T("common.quotations"), exact: true })
        .filter({ visible: true })
        .first()
        .click();
    }),
    waitFor: async (page) => {
      await page.locator('main [role="status"][aria-busy="true"]').first().waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "quotation-drawer-loading",
    identity: "rep",
    path: "/quotations?view=list",
    steps: chain(slowNetwork(), openFirstRow("open")),
    waitFor: async (page) => {
      await page.locator('[data-slot="sheet-content"][aria-busy="true"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "quotations-filtered-out",
    identity: "rep",
    path: "/quotations?view=list&status=requested",
    // Faisal has a paper in every state, so nothing he can press hides his whole
    // floor. What does happen: he searches for a waiting paper's number with
    // Issued still pressed, and the chip hides the one the search found.
    steps: async (page) => {
      const locale = new URL(page.url()).pathname.split("/")[1];
      const number = (
        await page.locator('[data-slot="row-number"]:visible').first().innerText()
      ).trim();
      await page.goto(
        `${BASE}/${locale}/quotations?view=list&q=${encodeURIComponent(number)}&status=issued`,
        { waitUntil: "load" },
      );
      assertHost(page);
      await waitForHydration(page);
    },
    waitFor: async (page, T) => {
      await page
        .locator('[data-slot="empty"]')
        .getByRole("link", { name: T("quotations.showAll"), exact: true })
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "quotation-drawer-issued",
    identity: "rep",
    path: "/quotations?view=list&status=issued",
    steps: openFirstRow("open"),
    waitFor: dialogWithText("quotations.accepted"),
  },
  {
    role: "rep",
    key: "quotation-drawer-accepted",
    identity: "rep",
    path: "/quotations?view=list&status=accepted",
    steps: openFirstRow("open"),
    waitFor: dialogWithText("quotations.revise"),
  },
  {
    role: "rep",
    key: "quotation-drawer-rejected",
    identity: "rep",
    path: "/quotations?view=list&status=rejected",
    steps: openFirstRow("open"),
    waitFor: dialogWithText("quotations.rejectedReason"),
  },
  {
    role: "rep",
    key: "quotation-accept",
    identity: "rep",
    path: "/quotations?view=list&status=issued",
    steps: chain(openFirstRow("open"), async (page, T, prefix, width) => {
      await dialogWithText("quotations.accepted")(page, T, prefix, width);
      await page.getByRole("dialog").first().getByRole("button", { name: T("quotations.accepted"), exact: true }).click();
    }),
    waitFor: textWithin("quotations.acceptHint"),
  },
  {
    role: "rep",
    key: "quotation-reject",
    identity: "rep",
    path: "/quotations?view=list&status=issued",
    steps: chain(openFirstRow("open"), async (page, T, prefix, width) => {
      await dialogWithText("quotations.rejected")(page, T, prefix, width);
      await page.getByRole("dialog").first().getByRole("button", { name: T("quotations.rejected"), exact: true }).click();
    }),
    waitFor: textWithin("quotations.rejectHint"),
  },
  {
    role: "rep",
    key: "quotation-revise",
    identity: "rep",
    path: "/quotations?view=list&status=accepted",
    steps: chain(openFirstRow("open"), async (page, T, prefix, width) => {
      await dialogWithText("quotations.revise")(page, T, prefix, width);
      await page.getByRole("dialog").first().getByRole("button", { name: T("quotations.revise"), exact: true }).click();
    }),
    waitFor: async (page, T) => {
      await page
        .getByRole("dialog", { name: T("quotations.revise"), exact: true })
        .locator('[data-slot="quotation-line"]')
        .first()
        .waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "quotation-request-refused",
    identity: "rep",
    path: "/quotations?view=list",
    steps: chain(clickButton("quotations.request"), async (page, T) => {
      const form = page.getByRole("dialog", { name: T("quotations.request"), exact: true });
      await form.locator('[data-slot="quotation-line"]').first().waitFor({ state: "visible" });
      await form.getByRole("button", { name: T("common.save"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "quotation-withdraw",
    identity: "rep",
    path: "/quotations?view=list&status=requested",
    steps: chain(openFirstRow("open"), async (page, T, prefix, width) => {
      await dialogWithText("quotations.editRequest")(page, T, prefix, width);
      await page.getByRole("dialog").first().locator('[data-slot="row-menu"]').first().click();
      await page.getByRole("menuitem", { name: T("quotations.cancel"), exact: true }).click();
    }),
    waitFor: textWithin("quotations.cancelHint"),
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
    // The column's own heading: the phone's stage picker says the same word
    // first in the document, and at 1366 it is hidden.
    waitFor: visibleText("dispatches.statusSubmitted"),
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
  /* The dispatch states S12.5 reshaped (P13-G6): the request filled — its lines,
     a service and the live total — a refused load and an approved one with their
     trails, the terms on credit, the drawer on its way, and a chip that hides
     every row. Nothing is saved: the form is filled and left open. */
  {
    role: "rep",
    key: "dispatch-request-filled",
    identity: "rep",
    path: "/dispatches?view=list",
    steps: chain(
      clickButton("dispatches.request"),
      pickCombobox("common.company"),
      async (page, T) => {
        const form = page.getByRole("dialog").first();
        await form.locator('[data-slot="dispatch-line"]').first().waitFor({ state: "visible" });
        // A direct load opens on an empty line: give it what a rep types.
        const colour = form.getByLabel(T("common.colourCode"), { exact: true }).first();
        if ((await colour.inputValue()) === "") {
          await colour.fill("168");
          for (const key of ["common.supplier", "common.fireRating", "common.class"]) {
            await form.getByRole("combobox", { name: T(key), exact: true }).first().click();
            await page.getByRole("option").first().click();
          }
          await form.getByLabel(T("common.pricePerSqm"), { exact: true }).first().fill("95");
        }
        await form.getByRole("button", { name: T("quotations.addService"), exact: true }).click();
        const service = form.locator('[data-slot="quotation-service"]').last();
        await service.getByRole("combobox", { name: T("quotations.service"), exact: true }).click();
        await page.getByRole("option").first().click();
        await service.getByLabel(T("common.sqm"), { exact: true }).fill("12");
        await service.getByLabel(T("common.pricePerSqm"), { exact: true }).fill("25");
        await form.getByLabel(T("common.destination"), { exact: true }).fill("الدرعية — موقع المشروع");
        // The chip's label is the control; its radio is out of the layout.
        await form.getByText(T("dispatches.payment.credit"), { exact: true }).click();
      },
    ),
    waitFor: async (page) => {
      const totals = page.getByRole("dialog").first().locator('[data-slot="totals"]');
      await totals.waitFor({ state: "visible" });
      await totals.scrollIntoViewIfNeeded();
    },
  },
  {
    role: "rep",
    key: "dispatch-refused",
    identity: "rep",
    path: "/dispatches?view=list&status=refused",
    steps: openFirstRow("open"),
    waitFor: async (page) => {
      await page.getByRole("dialog").locator('[data-slot="refused-reason"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "dispatch-approved-trail",
    identity: "rep",
    path: "/dispatches?view=list&status=approved",
    steps: openFirstRow("open"),
    waitFor: async (page) => {
      const approval = page.getByRole("dialog").locator("li[data-event='approve']");
      await approval.waitFor({ state: "visible" });
      await approval.scrollIntoViewIfNeeded();
    },
  },
  {
    role: "rep",
    key: "dispatch-refused-trail",
    identity: "rep",
    path: "/dispatches?view=list&status=refused",
    steps: openFirstRow("open"),
    waitFor: async (page) => {
      const refusal = page.getByRole("dialog").locator("li[data-event='refuse']");
      await refusal.waitFor({ state: "visible" });
      await refusal.scrollIntoViewIfNeeded();
    },
  },
  {
    role: "rep",
    key: "dispatch-credit",
    identity: "rep",
    // The newest load on the demo floor is paid for on credit, with the note.
    path: "/dispatches?view=list",
    steps: openFirstRow("open"),
    waitFor: async (page) => {
      const note = page.getByRole("dialog").locator('[data-slot="payment-note"]');
      await note.waitFor({ state: "visible" });
      await page.getByRole("dialog").locator('[data-slot="terms"]').scrollIntoViewIfNeeded();
    },
  },
  {
    role: "rep",
    key: "dispatch-drawer-loading",
    identity: "rep",
    path: "/dispatches?view=list",
    steps: chain(slowNetwork(), openFirstRow("open")),
    waitFor: async (page) => {
      await page.locator('[data-slot="sheet-content"][aria-busy="true"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "dispatches-filtered-out",
    // Marketing sells like a rep (SPEC §3 P13) and has one approved load on the
    // demo floor, so Refused hides the whole of it.
    identity: "marketing",
    path: "/dispatches?view=list&status=refused",
    waitFor: textVisible("dispatches.showAll"),
  },
  {
    role: "rep",
    key: "dispatches-loading",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(slowNetwork(), async (page, T) => {
      const link = page.getByRole("link", { name: T("common.dispatches"), exact: true }).filter({ visible: true });
      // On a phone Dispatches is in the bottom bar's menu, not on the bar.
      if ((await link.count()) === 0) {
        await page.getByRole("button", { name: T("common.menu"), exact: true }).click();
      }
      await link.first().click();
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="dispatches-skeleton"]').waitFor({ state: "visible" });
    },
  },
  { role: "rep", key: "reports", identity: "rep", path: "/reports", waitFor: heading("reports.title") },
  // The states S12.8 reshaped. The popup pressed with nothing chosen and nothing
  // written, which the form refuses itself before any action is asked.
  {
    role: "rep",
    key: "report-dialog-refused",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(
      clickButtonByPrefix("reports.addFor"),
      (page, T, prefix, width) => dialogWithText("reports.dialog.kind")(page, T, prefix, width),
      async (page, T) => {
        await page.getByRole("dialog").getByRole("button", { name: T("common.save"), exact: true }).click();
      },
    ),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  // A month he wrote nothing in: two before this one, which the seed never
  // reaches, so it is empty whatever day this runs.
  {
    role: "rep",
    key: "reports-empty-month",
    identity: "rep",
    path: "/reports",
    steps: async (page) => {
      const locale = new URL(page.url()).pathname.split("/")[1];
      const month = new Date();
      month.setUTCDate(1);
      month.setUTCMonth(month.getUTCMonth() - 2);
      await page.goto(`${BASE}/${locale}/reports?month=${month.toISOString().slice(0, 7)}`, {
        waitUntil: "load",
      });
      assertHost(page);
      await waitForHydration(page);
    },
    waitFor: async (page) => {
      await page.locator("[data-slot='empty']").first().waitFor({ state: "visible" });
    },
  },
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
    // Before anything is typed: the sentence, and under it what he was busy
    // with (S12.1). The phone's box has a shorter placeholder than the desk's,
    // so the proof is the records rather than the placeholder.
    waitFor: dialogWithText("shell.recentCompanies"),
  },
  {
    role: "rep",
    key: "search-loading",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(holdServerActions(), pressKeys("Control+k")),
    waitFor: async (page) => {
      await page.locator("[data-slot='search-skeleton']").waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "search-results",
    identity: "rep",
    path: "/day?tab=work",
    // A word most of his companies carry, so more match than a group shows and
    // the line that says so is drawn too.
    steps: chain(pressKeys("Control+k"), typeInPalette("شركة")),
    waitFor: async (page) => {
      await page.locator("[data-slot='search-capped']").waitFor({ state: "visible" });
    },
  },
  {
    role: "rep",
    key: "search-nothing",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(pressKeys("Control+k"), typeInPalette("zzzzqqq")),
    waitFor: dialogWithText("shell.searchNoResults", { q: "zzzzqqq" }),
  },
  {
    role: "rep",
    key: "search-offline",
    identity: "rep",
    path: "/day?tab=work",
    steps: chain(
      pressKeys("Control+k"),
      async (page, T, prefix, width) => dialogWithText("shell.recentCompanies")(page, T, prefix, width),
      cutServerActions(),
      typeInPalette("شركة"),
    ),
    waitFor: dialogWithText("shell.searchUnreachable"),
  },
  {
    role: "rep",
    key: "user-menu",
    identity: "rep",
    path: "/day?tab=work",
    steps: clickButtonByPrefix("shell.accountMenuFor"),
    waitFor: menuVisible(),
  },
  // Two of the shell's states are only reachable as somebody other than Faisal,
  // and are kept here beside his because they are the same screens (S12.1).
  // A clean bell: the seed gives the manager no notices at all.
  {
    role: "manager",
    key: "notifications-empty",
    identity: "manager",
    path: "/notifications",
    waitFor: textVisible("shell.emptyNotifications"),
  },
  // Jerom reading Faisal's day through Faisal's eyes, banner and all. The
  // view-as cookie is scoped to the day's own address, so no other state the
  // admin's context captures is taken over by it.
  {
    role: "admin",
    key: "viewing-rep-day",
    identity: "admin",
    path: "/team?tab=team",
    steps: viewAsOnDay(/Faisal|فيصل/),
    waitFor: async (page, T, prefix, width) => {
      await page.locator("[data-slot='viewing-banner']").waitFor({ state: "visible" });
      await textVisible("day.whoToCall")(page, T, prefix, width);
    },
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
  // S12.5: her two answers. Approve pressed with no number, which the action
  // refuses before it reads the load; Refuse with its reason typed and left open.
  {
    role: "coordinator",
    key: "queue-dispatch-approve-refused",
    identity: "coordinator",
    path: "/queue",
    steps: chain(openFirstRow("dispatch"), async (page, T) => {
      const sheet = page.getByRole("dialog").first();
      await sheet.getByRole("button", { name: T("dispatches.approve"), exact: true }).click();
      const ask = page.getByRole("dialog").filter({ hasText: T("dispatches.approveHint") });
      await ask.getByRole("button", { name: T("dispatches.approve"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "coordinator",
    key: "queue-dispatch-refuse",
    identity: "coordinator",
    path: "/queue",
    steps: chain(openFirstRow("dispatch"), async (page, T) => {
      const sheet = page.getByRole("dialog").first();
      await sheet.getByRole("button", { name: T("dispatches.refuse"), exact: true }).click();
      await page
        .getByRole("dialog")
        .getByLabel(T("common.reason"), { exact: true })
        .fill("طريقة الشحن ليست كما في سماك لهذا المشروع.");
    }),
    waitFor: textWithin("dispatches.refuseHint"),
  },
  {
    role: "coordinator",
    key: "day-work",
    identity: "coordinator",
    path: "/day?tab=work",
    waitFor: textVisible("day.whoToCall"),
  },
  // Her desk while it reads, in its own shape (S12.6): arrived at from her day.
  {
    role: "coordinator",
    key: "queue-loading",
    identity: "coordinator",
    path: "/day?tab=work",
    // By its address: the bottom bar names the queue with a shorter word.
    steps: chain(keepSkeleton('[data-slot="queue-skeleton"]'), async (page) => {
      await page.locator('a[href$="/queue"]:visible').first().click();
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="queue-skeleton"]').waitFor({ state: "visible" });
    },
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
  /* The manager's tabs while they read (S12.7), each in its own shape under the
     tabs, reached by pressing the tab; and the metrics tab at its full height, so
     every card, every slice's word and its figure are in one picture however far
     below 900px they fall. */
  {
    role: "manager",
    key: "team-metrics-loading",
    identity: "manager",
    path: "/team?tab=work",
    steps: chain(keepSkeleton('[data-slot="metrics-skeleton"]'), slowNetwork(), async (page, T) => {
      await page.getByRole("link", { name: T("common.tab.metrics"), exact: true }).first().click();
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="metrics-skeleton"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "manager",
    key: "team-team-loading",
    identity: "manager",
    path: "/team?tab=work",
    steps: chain(keepSkeleton('[data-slot="people-skeleton"]'), slowNetwork(), async (page, T) => {
      await page.getByRole("link", { name: T("common.tab.team"), exact: true }).first().click();
    }),
    waitFor: async (page) => {
      await page.locator('[data-slot="people-skeleton"]').waitFor({ state: "visible" });
    },
  },
  {
    role: "manager",
    key: "team-metrics-full",
    identity: "manager",
    path: "/team?tab=metrics",
    waitFor: async (page, T, prefix, width) => {
      await textVisible("common.range.month")(page, T, prefix, width);
      await page.locator('[data-slot="builder"]').waitFor({ state: "visible" });
      // The viewport grown to the document, so the capture is the whole tab.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height });
    },
  },
  {
    role: "manager",
    key: "duplicates",
    identity: "manager",
    path: "/duplicates",
    waitFor: heading("duplicates.title"),
  },
  { role: "manager", key: "leads", identity: "manager", path: "/leads", waitFor: heading("leads.title") },
  // S12.8: a person with nothing written this month, read the way the manager
  // reaches it — Rawan's name on the team's day is the door, and her id is on it.
  {
    role: "manager",
    key: "reports-person-empty",
    identity: "manager",
    path: "/reports?period=day",
    steps: async (page) => {
      const href = await page
        .locator("[data-slot='team-person'] a[href*='person=']")
        .filter({ hasText: /Rawan|روان/ })
        .first()
        .getAttribute("href");
      const id = href ? new URL(href, BASE).searchParams.get("person") : null;
      if (!id) throw new Error("no team section for Rawan");
      const locale = new URL(page.url()).pathname.split("/")[1];
      await page.goto(`${BASE}/${locale}/reports?person=${id}`, { waitUntil: "load" });
      assertHost(page);
      await waitForHydration(page);
    },
    waitFor: async (page) => {
      await page.locator("[data-slot='empty']").first().waitFor({ state: "visible" });
    },
  },

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
  /* The admin states S12.9 reshaped (P13-G6): a row's menu, the act apart in it,
     a refused save, an empty search, and a download on its way and failed. The
     two refusals press Save on an EMPTY form, which the action refuses before it
     reads anything; the two downloads are answered by the page itself, held or
     failed, so no file is built and nothing is written. */
  {
    role: "admin",
    key: "admin-users-menu",
    identity: "admin",
    path: "/admin/users",
    steps: clickButtonByPrefix("common.moreFor"),
    waitFor: menuVisible(),
  },
  {
    role: "admin",
    key: "admin-users-menu-self",
    identity: "admin",
    path: "/admin/users",
    // His own row: Deactivate is there, not pressable, and says why.
    steps: async (page) => {
      await page
        .locator("tr:visible, li:visible")
        .filter({ hasText: IDENTITIES.admin })
        .locator('[data-slot="row-menu"]')
        .first()
        .click();
    },
    waitFor: menuVisible(),
  },
  {
    role: "admin",
    key: "admin-users-deactivate",
    identity: "admin",
    path: "/admin/users",
    steps: chain(clickButtonByPrefix("common.moreFor"), async (page, T) => {
      await page.getByRole("menuitem", { name: T("admin.deactivate"), exact: true }).click();
    }),
    waitFor: dialogVisible(),
  },
  {
    role: "admin",
    key: "admin-users-refused",
    identity: "admin",
    path: "/admin/users",
    steps: chain(clickButton("admin.addUser"), async (page, T) => {
      await page.getByRole("dialog").getByRole("button", { name: T("common.save"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "admin",
    key: "admin-lookups-refused",
    identity: "admin",
    path: "/admin/lookups?list=categories",
    steps: chain(clickButton("admin.addRow"), async (page, T) => {
      await page.getByRole("dialog").getByRole("button", { name: T("common.save"), exact: true }).click();
    }),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "admin",
    key: "admin-holidays-remove",
    identity: "admin",
    path: "/admin/holidays",
    steps: clickButton("admin.removeDay"),
    waitFor: dialogVisible(),
  },
  {
    role: "admin",
    key: "admin-archive-no-match",
    identity: "admin",
    path: "/admin/archive?q=no-such-record",
    waitFor: textVisible("admin.archiveEmptySearch", { q: "no-such-record" }),
  },
  {
    role: "admin",
    key: "admin-export-preparing",
    identity: "admin",
    path: "/admin/export",
    steps: async (page, T) => {
      // Held on its way, so the pressed Download is caught while it prepares.
      await page.route("**/api/export/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        await route.continue().catch(() => {});
      });
      await page.getByRole("button", { name: T("admin.download") }).first().click();
    },
    waitFor: textVisible("admin.preparing"),
  },
  {
    role: "admin",
    key: "admin-export-failed",
    identity: "admin",
    path: "/admin/export",
    steps: async (page, T) => {
      await page.route("**/api/export/**", (route) => route.fulfill({ status: 500, body: "" }));
      await page.getByRole("button", { name: T("admin.download") }).first().click();
    },
    // The file's name is itself a message, so the sentence is built in two steps.
    waitFor: (page, T, prefix, width) =>
      textVisible("admin.exportFailed", { file: T("common.companies") })(page, T, prefix, width),
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
  // S12.8: Save pressed on the empty lead form, which the action refuses before
  // it reads anything; and a number already on file typed into the contact,
  // which only reads.
  {
    role: "marketing",
    key: "lead-new-refused",
    identity: "marketing",
    path: "/leads",
    steps: chain(
      clickButton("leads.new"),
      (page, T, prefix, width) => dialogWithText("leads.giveToHint")(page, T, prefix, width),
      async (page, T) => {
        await page.getByRole("dialog").getByRole("button", { name: T("common.save"), exact: true }).click();
      },
    ),
    waitFor: async (page) => {
      await page.getByRole("dialog").getByRole("alert").first().waitFor({ state: "visible" });
    },
  },
  {
    role: "marketing",
    key: "lead-new-duplicate",
    identity: "marketing",
    path: "/leads",
    steps: chain(
      clickButton("leads.new"),
      (page, T, prefix, width) => dialogWithText("leads.giveToHint")(page, T, prefix, width),
      async (page, T) => {
        // A seeded contact's number (scripts/seed/demo-data.ts), on two floors.
        await page.getByRole("dialog").getByLabel(T("common.phone")).fill("0556612094");
      },
    ),
    waitFor: async (page) => {
      const warning = page.locator("[data-slot='duplicate-warning']");
      await warning.waitFor({ state: "visible" });
      // On a phone the sheet's body scrolls, and the warning sits under the fold.
      await warning.scrollIntoViewIfNeeded();
    },
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
