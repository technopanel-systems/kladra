import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { login, type Persona } from "./helpers/auth";
import { one } from "./helpers/db";
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
 * Screens first, then the four drawers the work happens in (at the end of this
 * file). The dialogs a drawer opens are not read here yet — see the note on
 * `PANELS` for why the drawers were owed. Both themes, because contrast is a
 * property of a theme, and a light screen that passes says nothing about the
 * dark one.
 *
 * Next's development badge is not the app's, so it is left out of the reading.
 */

type Screen = { who: Persona; path: string };

const SCREENS: Screen[] = [
  { who: "faisal", path: "/day?tab=work" },
  { who: "faisal", path: "/day?tab=metrics" },
  { who: "faisal", path: "/companies" },
  { who: "faisal", path: "/projects?view=list" },
  { who: "faisal", path: "/projects?view=board" },
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

/**
 * And the drawers, which is where the work is.
 *
 * The note at the top of this file said each dialog and drawer was read by the
 * spec of the slice that owns it. It was not true — `AxeBuilder` appeared in
 * this file and nowhere else, so until P14.5 every screen in Kladra had been
 * read by axe and not one of the panels a rep actually works in had. A rep
 * opens the companies list to find a customer and then spends the rest of the
 * morning inside its drawer; a coordinator lives in the quotation's.
 *
 * Opened by `?open=`, which is how the app opens them and how a link somebody
 * forwarded opens them, so the reading is of the real thing over the real
 * screen and not of a panel mounted on its own. Both themes, for the reason the
 * screens are read in both: contrast belongs to a theme.
 *
 * The ids come from the seed by the same shape the other specs ask for, never
 * by name, so a reseed with different words still finds them.
 */
const PANELS = [
  {
    who: "faisal" as const,
    what: "the company drawer",
    path: "/companies",
    id: `select c.id from companies c join users u on u.id = c.rep_id
          where u.email = 'faisal@technopanel.com.sa' and c.archived_at is null
          order by c.created_at limit 1`,
  },
  {
    who: "faisal" as const,
    what: "the project drawer",
    path: "/projects",
    id: `select p.id from projects p join users u on u.id = p.rep_id
          where u.email = 'faisal@technopanel.com.sa' and p.archived_at is null
          order by p.created_at limit 1`,
  },
  {
    who: "rawan" as const,
    what: "the quotation drawer",
    path: "/quotations",
    id: `select id from quotations order by created_at limit 1`,
  },
  {
    who: "rawan" as const,
    what: "the dispatch drawer",
    path: "/dispatches",
    id: `select id from dispatches order by created_at limit 1`,
  },
];

for (const who of [...new Set(PANELS.map((p) => p.who))]) {
  test(`every drawer ${who} works in has nothing axe can find, in either theme`, async ({
    page,
    locale,
    baseURL,
  }) => {
    test.slow();
    await login(page, locale, who);
    const found: string[] = [];

    for (const theme of THEMES) {
      await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      for (const panel of PANELS.filter((p) => p.who === who)) {
        const row = await one<{ id: string }>(panel.id);
        await page.goto(`/${locale}${panel.path}?open=${row.id}`);
        // The panel itself, not the list behind it: a drawer that never opened
        // would otherwise be read as a clean screen and pass.
        const dialog = page.getByRole("dialog").first();
        await dialog.waitFor();
        // Its content, not its skeleton: the drawer streams, and a reading of
        // the placeholder is a reading of nothing (it came back clean that way).
        await dialog.getByRole("heading").first().waitFor();
        // And at rest, not arriving. The drawer fades in over 200 ms (DESIGN
        // §1b), and read mid-fade every grey in it is a paler grey over whatever
        // is behind — a first run reported seventeen contrast failures that were
        // the animation, not the palette (P14.5). This waits for exactly what a
        // person sees once it has opened.
        await dialog.evaluate((el) =>
          Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
        );
        for (const line of await read(page)) found.push(`${panel.what} ${theme}: ${line}`);
      }
    }

    expect(found).toEqual([]);
  });
}
