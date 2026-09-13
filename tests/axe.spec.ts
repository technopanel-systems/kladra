import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { login, type Persona } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * Every screen, for every role, in both locales and both themes, read by axe
 * (P13-S1, DESIGN §1b).
 *
 * A screen is WCAG 2.1 A and AA or it is not done: a label a reader cannot
 * hear, a grey a rep in the sun cannot read, a region a keyboard cannot reach.
 * The walk asks for no violation at all rather than for "no serious one",
 * because a rule that tolerates the small ones is a rule that is renegotiated
 * one screen at a time.
 *
 * Screens, not dialogs: each dialog and drawer is walked by the spec of the
 * slice that owns it. Both themes, because contrast is a property of a theme,
 * and a light screen that passes says nothing about the dark one.
 *
 * Next's development badge is not the app's, so it is left out of the reading.
 */

type Screen = { who: Persona; path: string };

const SCREENS: Screen[] = [
  { who: "faisal", path: "/day?tab=work" },
  { who: "faisal", path: "/day?tab=metrics" },
  { who: "faisal", path: "/companies" },
  { who: "faisal", path: "/projects" },
  { who: "faisal", path: "/quotations?view=list" },
  { who: "faisal", path: "/quotations?view=board" },
  { who: "faisal", path: "/dispatches?view=list" },
  { who: "faisal", path: "/dispatches?view=board" },
  { who: "faisal", path: "/reports" },
  { who: "faisal", path: "/notifications" },
  { who: "rawan", path: "/queue" },
  { who: "rawan", path: "/day?tab=work" },
  { who: "marketing", path: "/leads" },
  { who: "marketing", path: "/day?tab=work" },
  { who: "abdulrahman", path: "/team?tab=work" },
  { who: "abdulrahman", path: "/team?tab=metrics" },
  { who: "abdulrahman", path: "/team?tab=team" },
  { who: "abdulrahman", path: "/duplicates" },
  { who: "abdulrahman", path: "/leads" },
  { who: "jerom", path: "/admin/users" },
  { who: "jerom", path: "/admin/targets" },
  { who: "jerom", path: "/admin/lookups" },
  { who: "jerom", path: "/admin/holidays" },
  { who: "jerom", path: "/admin/use" },
  { who: "jerom", path: "/admin/archive" },
  { who: "jerom", path: "/admin/export" },
];

const THEMES = ["dark", "light"] as const;

async function read(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("nextjs-portal")
    .analyze();
  return violations.flatMap((v) =>
    v.nodes.map(
      (node) => `${v.id} (${v.impact ?? "?"}) — ${node.target.join(" ")}: ${node.failureSummary?.split("\n").slice(0, 2).join(" ")}`,
    ),
  );
}

test("the sign-in screen has nothing axe can find, in either theme", async ({ page, locale, baseURL }) => {
  for (const theme of THEMES) {
    await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    await page.goto(`/${locale}/login`);
    expect(await read(page), `/login in ${theme}`).toEqual([]);
  }
});

for (const who of [...new Set(SCREENS.map((s) => s.who))]) {
  test(`every screen ${who} reaches has nothing axe can find, in either theme`, async ({
    page,
    locale,
    baseURL,
  }) => {
    test.slow();
    await login(page, locale, who);
    const found: string[] = [];
    for (const theme of THEMES) {
      await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      for (const { path } of SCREENS.filter((s) => s.who === who)) {
        await page.goto(`/${locale}${path}`);
        await page.getByRole("main").waitFor();
        for (const line of await read(page)) found.push(`${path} ${theme}: ${line}`);
      }
    }
    expect(found).toEqual([]);
  });
}
