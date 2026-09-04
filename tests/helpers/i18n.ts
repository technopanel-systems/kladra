import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, type Page } from "@playwright/test";
import { createTranslator } from "use-intl/core";
import { isolateMessages } from "@/i18n/isolate";

/**
 * The two locales this app ships (src/i18n/routing.ts). Playwright's project
 * names in playwright.config.ts ARE these locale codes — the `locale` fixture
 * below reads `testInfo.project.name` straight, no separate mapping table.
 */
export type Locale = "en" | "ar";

export function isLocale(value: string): value is Locale {
  return value === "en" || value === "ar";
}

type Messages = Record<string, unknown>;

/**
 * A translator with the plain call signature plus `.has`, loosened from
 * use-intl's literal-key generics: spec files build keys as computed strings
 * ("common.companies"), not statically-known message-tree literals, so the
 * strict `Translator<Messages, Namespace>` type from use-intl/core would
 * reject them at the call site.
 */
export type Translate = {
  (key: string, values?: Record<string, string | number | Date>): string;
  has(key: string): boolean;
};

const messagesCache = new Map<Locale, Messages>();
const translatorCache = new Map<Locale, Translate>();

/**
 * Mirrors src/i18n/request.ts's merge (messages/<locale>/<namespace>.json,
 * one file per feature, merged under its file name as the namespace) but is
 * its own copy: request.ts is wired into next-intl's per-request server
 * config and isn't meant to run outside a Next.js request. Cached per
 * locale for the run — messages/ never changes mid test-run.
 *
 * It shares one thing with request.ts on purpose: `isolateMessages`. A spec's
 * expected string has to carry the same isolates the screen does, or every
 * assertion naming a `{placeholder}` message would miss by two invisible
 * characters.
 */
export function loadMessages(locale: Locale): Messages {
  const cached = messagesCache.get(locale);
  if (cached) return cached;
  const dir = join(process.cwd(), "messages", locale);
  const merged: Messages = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    merged[file.slice(0, -5)] = isolateMessages(
      JSON.parse(readFileSync(join(dir, file), "utf8")),
    );
  }
  messagesCache.set(locale, merged);
  return merged;
}

/**
 * One translator per locale, built on the exact ICU engine next-intl uses at
 * runtime (`use-intl/core` — framework-agnostic, needs no request/React
 * context), so a plural or `{name}` placeholder renders in tests exactly as
 * it will on screen. `onError` is overridden to throw: next-intl's default
 * only logs and falls back to rendering "namespace.key", which would make a
 * missing message fail as a confusing text mismatch instead of a clear error
 * naming the key.
 */
export function getTranslator(locale: Locale): Translate {
  const cached = translatorCache.get(locale);
  if (cached) return cached;
  const translator = createTranslator({
    locale,
    messages: loadMessages(locale),
    onError(error) {
      throw error;
    },
  });
  const typed = translator as unknown as Translate;
  translatorCache.set(locale, typed);
  return typed;
}

/** One-shot lookup for helpers that run outside a fixture (tests/helpers/auth.ts). */
export function translate(
  locale: Locale,
  key: string,
  values?: Record<string, string | number | Date>,
): string {
  return getTranslator(locale)(key, values);
}

type Fixtures = {
  locale: Locale;
  t: Translate;
};

/**
 * An uncaught exception in the browser is a failure of the test that provoked
 * it, wherever it surfaces.
 *
 * It cost an afternoon to learn that: a React error inside the company drawer
 * put Next's dev overlay on screen, and the overlay's own disabled buttons were
 * counted by a spec looking for dead controls — which reported three unlabelled
 * disabled buttons and said nothing about the actual crash. Every spec now fails
 * on the exception itself, naming it.
 *
 * Only `pageerror` — a genuinely uncaught throw. Console noise is not a failure.
 */
function watchForRuntimeErrors(page: Page): () => void {
  const errors: string[] = [];
  const firstLine = (error: Error): string => error.message.split(/\r?\n/)[0];
  page.on("pageerror", (error) => errors.push(firstLine(error)));
  return () => {
    if (errors.length === 0) return;
    const many = errors.length === 1 ? "an uncaught error" : `${errors.length} uncaught errors`;
    throw new Error(
      [`The browser threw ${many} during this test:`, ...errors.map((e) => `  - ${e}`)].join("\n"),
    );
  };
}

/**
 * Waits, after every page load, for React to have taken over the HTML.
 *
 * A screen is readable before it is live, and a press in between does nothing —
 * silently. Playwright's actionability checks cannot see it: the button is
 * there, visible and enabled, and the click lands on markup. It bites the fast
 * pages hardest, so a suite passes cold and fails warm.
 *
 * `<Hydrated>` in the root layout stamps `html[data-hydrated]` on mount
 * (src/components/shell/hydrated.tsx). Every `goto` waits for it here rather
 * than at three hundred call sites. A soft navigation keeps the root mounted, so
 * the mark is still there on the other side and clicking a link needs nothing.
 */
function waitForHydrationAfterEveryLoad(page: Page): void {
  const goto = page.goto.bind(page);
  page.goto = async (url, options) => {
    const response = await goto(url, options);
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    return response;
  };
}

/**
 * Extends Playwright's `test` with `locale` (the app's URL-prefix locale,
 * read from the project name) and `t` (the translator above). Every spec
 * imports `test`/`expect` from here, never straight from "@playwright/test"
 * — that's what keeps a hard-coded English string out of an assertion.
 */
// Playwright's fixture callback is positional — the second argument is the
// "provide this value" function, conventionally named `use`. It's renamed to
// `provide` here purely to dodge eslint-plugin-react-hooks: the rule treats
// any call to a function literally named `use` as React 19's `use()` hook
// and demands a component/hook-named caller, which a Playwright fixture
// is not.
export const test = base.extend<Fixtures>({
  locale: async ({}, provide, testInfo) => {
    const name = testInfo.project.name;
    if (!isLocale(name)) {
      throw new Error(
        `Project "${name}" is not "en" or "ar" — tests/helpers/i18n.ts derives the app ` +
          "locale straight from the playwright.config.ts project name.",
      );
    }
    await provide(name);
  },
  t: async ({ locale }, provide) => {
    await provide(getTranslator(locale));
  },
  page: async ({ page }, provide) => {
    const assertNone = watchForRuntimeErrors(page);
    waitForHydrationAfterEveryLoad(page);
    await provide(page);
    assertNone();
  },
});

export { expect } from "@playwright/test";
