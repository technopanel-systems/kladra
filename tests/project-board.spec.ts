import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { LIST_LIMIT } from "@/lib/list-size";
import { PROJECT_STAGES, projectStage, type ProjectStage, type StageFacts } from "@/lib/project-stage";

/**
 * The projects board (SPEC §3 P13, D170): five columns a job's own papers put it
 * in, never typed and never dragged.
 *
 * What would make this board worse than no board is a job in the wrong column —
 * it looks perfect. So every project the manager can see is found on the screen
 * and its column compared with the one this spec works out for itself: the
 * facts counted here in SQL written apart from the app's (tests keep their own
 * copy, rules/data.md), and the decision taken by the pure rule the app's SQL
 * spells out (`projectStage`, asked on its own in tests/project-stage.spec.ts).
 * The app's CASE and this spec's facts can then only agree if the two SQL
 * readings of "standing", "priced" and "sheets to go" agree.
 *
 * Cards are matched by the record they open, not by their text: two jobs at one
 * hotel are «توسعة فندق العزيزية» and «توسعة فندق العزيزية - الجناح الشرقي», and
 * a name matched as a substring finds both.
 */

const COLD = { timeout: 30_000 };

const STAGE_KEYS: Record<ProjectStage, string> = {
  open: "projects.stageOpen",
  quoted: "projects.stageQuoted",
  dispatching: "projects.stageDispatching",
  won: "projects.stageWon",
  lost: "projects.stageLost",
};

type Facts = { id: string; name: string } & StageFacts;

/** Every project on the floor, with the six facts the rule reads, counted here. */
async function projectFacts(): Promise<Facts[]> {
  return query<Facts>(`
    with live as (
      select q.id, q.project_id, q.number, q.status
        from quotations q
       where q.status in ('requested', 'returned', 'issued', 'accepted')
         and q.revision = (select max(r.revision) from quotations r where r.number = q.number)
    ),
    paper as (
      select live.*,
             exists (select 1 from quotations i
                      where i.number = live.number and i.issued_at is not null) as priced,
             exists (
               select 1 from quotation_items qi
                where qi.quotation_id = live.id
                  and qi.qty > coalesce((
                    select sum(di.qty) from dispatch_items di
                      join dispatches d on d.id = di.dispatch_id and d.status = 'approved'
                     where di.quotation_item_id = qi.id), 0)
             ) as to_go,
             exists (select 1 from dispatches d
                       join quotations dq on dq.id = d.quotation_id
                      where dq.number = live.number and d.status = 'approved') as loaded
        from live
    )
    select pr.id::text as id, pr.name,
           pr.lost_at is not null as lost,
           exists (select 1 from paper where paper.project_id = pr.id
                     and paper.priced and paper.loaded and paper.to_go) as dispatching,
           exists (select 1 from dispatches d
                    where d.project_id = pr.id and d.status = 'approved') as dispatched,
           exists (select 1 from paper where paper.project_id = pr.id
                     and paper.priced and paper.to_go) as "toGo",
           exists (select 1 from paper where paper.project_id = pr.id
                     and paper.status = 'accepted' and not paper.to_go) as "acceptedDone",
           exists (select 1 from paper where paper.project_id = pr.id and paper.priced) as priced
      from projects pr
      join companies c on c.id = pr.company_id
     where pr.archived_at is null and c.archived_at is null
  `);
}

/** Each column on screen: its name, the count in its heading, the records its cards open. */
async function board(page: Page) {
  const regions = page.locator("[data-slot='board']").getByRole("region");
  await expect(regions.first()).toBeVisible(COLD);
  return regions.evaluateAll((nodes) =>
    nodes.map((node) => {
      const label = node.getAttribute("aria-label") ?? "";
      const open = label.lastIndexOf("(");
      return {
        name: label.slice(0, open).trim(),
        count: Number(label.slice(open + 1, label.lastIndexOf(")"))),
        ids: [...node.querySelectorAll("a[href*='open=']")].map(
          (a) => new URL((a as HTMLAnchorElement).href).searchParams.get("open") ?? "",
        ),
      };
    }),
  );
}

test("the projects board puts every project in the column its own papers decide, and a card opens its drawer", async ({
  page,
  locale,
  t,
}) => {
  const floor = await projectFacts();
  expect(floor.length, "no projects on the floor — the seed changed").toBeGreaterThan(0);

  // The manager reads every floor, so every project is on his board.
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/projects?view=board`);
  const columns = await board(page);

  await test.step("five columns, in the order a job lives them", async () => {
    expect(columns.map((column) => column.name)).toEqual(
      PROJECT_STAGES.map((stage) => t(STAGE_KEYS[stage])),
    );
  });

  await test.step("every project is in exactly the column the rule gives its facts", async () => {
    for (const project of floor) {
      const expected = t(STAGE_KEYS[projectStage(project)]);
      const found = columns.filter((column) => column.ids.includes(project.id)).map((c) => c.name);
      expect(found, `«${project.name}» should be under ${expected}`).toEqual([expected]);
    }
  });

  await test.step("each heading counts what its column holds", async () => {
    for (const stage of PROJECT_STAGES) {
      const column = columns.find((one) => one.name === t(STAGE_KEYS[stage]))!;
      const expected = floor.filter((project) => projectStage(project) === stage).length;
      expect(column.count, `${column.name} counts ${column.count}`).toBe(expected);
      expect(column.ids.length, `${column.name} draws ${column.ids.length}`).toBe(expected);
      // The seed puts a job in every column (scripts/seed/demo-data.ts), so no
      // column here is proved only by being empty.
      expect(expected, `nothing seeded lands under ${column.name}`).toBeGreaterThan(0);
    }
  });

  await test.step("a card opens its project's drawer over the board", async () => {
    const dispatching = floor.find((project) => projectStage(project) === "dispatching")!;
    // By the record it opens (see the note at the top): the link's own name
    // carries the job's name, and another job's name can contain it.
    await page
      .locator("[data-slot='board']")
      .getByRole("region", { name: new RegExp(`^${t(STAGE_KEYS.dispatching)} \\(`) })
      .getByRole("link")
      .and(page.locator(`[href*="open=${dispatching.id}"]`))
      .click();
    await expect(page.getByRole("dialog", { name: dispatching.name })).toBeVisible(COLD);
    await expect(page).toHaveURL(/[?&]view=board/);
    await expect(page).toHaveURL(new RegExp(`[?&]open=${dispatching.id}`));
  });
});

test("in Arabic the projects board starts at the right, with Open first", async ({
  page,
  locale,
  t,
}) => {
  test.skip(locale !== "ar", "the question only exists right-to-left");
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/projects?view=board`);

  const regions = page.locator("[data-slot='board']").getByRole("region");
  await expect(regions.first()).toHaveAccessibleName(new RegExp(`^${t("projects.stageOpen")} `), COLD);
  const rights = await regions.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().right),
  );
  for (let i = 1; i < rights.length; i += 1) {
    expect(rights[i], `column ${i} is not to the left of column ${i - 1}`).toBeLessThan(rights[i - 1]);
  }
});

test("a column cut short by its cap still counts every project in it, and the other columns keep theirs", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // More new jobs than a list screen draws, on one company and all Open —
  // nothing asked for on any of them. Whatever a column's own cap is, it is no
  // more than a list's, so this cuts the Open column short. They are also the
  // newest cards on the board, so one cap shared across the columns would push
  // the older jobs of the other four off it: the long Dispatching ones first,
  // leaving "0" over a column that holds five (D80).
  const crowd = `Crowd ${locale} ${Date.now()}`;
  const inserted = await query<{ id: string }>(
    `insert into projects (company_id, rep_id, name)
     select c.id, c.rep_id, $1::text || ' ' || g
       from (select id, rep_id from companies where archived_at is null order by name limit 1) c
      cross join generate_series(1, $2::int) g
     returning id`,
    [crowd, LIST_LIMIT + 1],
  );

  try {
    const floor = await projectFacts();
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/projects?view=board`);
    const columns = await board(page);

    const open = columns.find((column) => column.name === t(STAGE_KEYS.open))!;
    const openCount = floor.filter((project) => projectStage(project) === "open").length;
    expect(openCount).toBeGreaterThan(LIST_LIMIT);
    expect(open.count, "the Open heading does not count what is in its column").toBe(openCount);
    expect(open.ids.length, "the Open column was not cut short").toBeLessThan(openCount);
    expect(open.ids.length).toBeGreaterThan(0);

    for (const stage of PROJECT_STAGES.filter((one) => one !== "open")) {
      const column = columns.find((one) => one.name === t(STAGE_KEYS[stage]))!;
      const expected = floor.filter((project) => projectStage(project) === stage).length;
      expect(column.count, `${column.name} counts ${column.count}`).toBe(expected);
      expect(column.ids.length, `${column.name} lost its cards to the crowd in Open`).toBe(expected);
    }

    // And the line under the board says how many are drawn of how many in all.
    const drawn = columns.reduce((sum, column) => sum + column.ids.length, 0);
    await expect(page.locator('[data-slot="list-tail"]')).toHaveText(
      t("common.showingFirst", { shown: drawn, total: floor.length }),
    );
  } finally {
    await query("delete from projects where id = any($1::uuid[])", [inserted.map((row) => row.id)]);
  }
});
