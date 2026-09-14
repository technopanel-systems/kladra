import { login } from "./helpers/auth";
import { one, personName, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { formatDay, type Day } from "@/lib/dates";
import { LIST_LIMIT } from "@/lib/list-size";

/**
 * The archive, rebuilt from its question (P13-S7): somebody archived the wrong
 * thing, and the admin finds it, makes sure it is the one, and puts it back.
 *
 * So the walk is exactly that. He searches by the name he was given, and the
 * screen narrows to it; the row says who took it off the floor, on which day,
 * and why, in the words they typed (D87); one press brings it back, and the
 * database agrees.
 *
 * The seeded archived company is used rather than one this spec archives,
 * because its "who" is the audit line the seed writes the way the action does —
 * and it is put back exactly as it was afterwards, date, reason and all, because
 * tests/known.spec.ts and the other locale's run both expect to find it.
 */

const COLD = { timeout: 30_000 };

type Archived = {
  id: string;
  name: string;
  reason: string;
  archivedAt: string;
  archivedOn: Day;
  archiverEmail: string;
};

test("the archive finds a thing by name, says who archived it and why, and restores it in one press", async ({
  page,
  locale,
  t,
}) => {
  const start = (await one<{ now: string }>("select now()::text as now")).now;
  const target = await one<Archived>(
    `select c.id, c.name, c.archive_reason as reason, c.archived_at::text as "archivedAt",
            to_char((c.archived_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as "archivedOn",
            u.email as "archiverEmail"
       from companies c
       join lateral (
         select a.user_id from audit_log a
          where a.record_type = 'company' and a.record_id = c.id::text and a.action = 'company.archive'
          order by a.at desc limit 1
       ) line on true
       join users u on u.id = line.user_id
      where c.archived_at is not null and c.merged_into_id is null and c.archive_reason is not null
      order by c.archived_at desc
      limit 1`,
  );
  const archiver = await personName(target.archiverEmail, locale);

  try {
    await login(page, locale, "jerom");
    await page.goto(`/${locale}/admin/archive`);
    await expect(page.getByRole("heading", { name: t("admin.archive") })).toBeVisible(COLD);

    await test.step("a search by part of the name narrows the archive to it", async () => {
      // The tail of the name, the way it arrives in a message: "the aluminium
      // one", not the full registered name.
      const part = target.name.split(" ").slice(-2).join(" ");
      await page.getByRole("searchbox", { name: t("admin.archiveSearchLabel") }).fill(part);
      await expect(page).toHaveURL(/[?&]q=/, COLD);

      const rows = page.getByRole("listitem");
      await expect(rows.filter({ hasText: target.name })).toHaveCount(1, COLD);
      // Everything else in the archive has stepped aside — the tombstone the
      // seed's fold left is archived too, and does not share the name.
      await expect(rows.filter({ hasText: "انماء للمقاولات" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: new RegExp(`^${t("common.companies")}`) })).toBeVisible();
    });

    const row = page.getByRole("listitem").filter({ hasText: target.name });

    await test.step("the row says who archived it, on which day, and why", async () => {
      await expect(row).toContainText(
        t("admin.archivedBy", { name: archiver, date: formatDay(target.archivedOn, locale) }),
      );
      await expect(row).toContainText(target.reason);
    });

    await test.step("one press puts it back, and the screen and the database agree", async () => {
      await row.getByRole("button", { name: t("admin.restore") }).click();
      await expect(page.getByText(t("admin.restored", { name: target.name }))).toBeVisible(COLD);
      // No second question: restoring takes nothing away.
      await expect(page.getByRole("alertdialog")).toHaveCount(0);

      await expect
        .poll(async () =>
          (await one<{ archived: boolean }>(
            "select archived_at is not null as archived from companies where id = $1::uuid",
            [target.id],
          )).archived,
        )
        .toBe(false);

      // Back on the floor, so off this screen: the search that found it finds nothing now.
      await expect(page.getByText(t("admin.archiveEmptySearch", { q: target.name.split(" ").slice(-2).join(" ") }))).toBeVisible(COLD);
    });
  } finally {
    // As it was found: archived on the same instant, for the same reason, and
    // no trace of this run's restore in the audit log.
    await query(
      "update companies set archived_at = $2::timestamptz, archive_reason = $3::text where id = $1::uuid",
      [target.id, target.archivedAt, target.reason],
    );
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text and action = 'restore'
          and at >= $2::timestamptz`,
      [target.id, start],
    );
  }
});

test("a crowd of newly archived companies does not push the archived contacts and projects off the archive", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // More companies than a list screen draws, archived a moment ago and so the
  // newest thing in the archive. One cap across the three groups, newest first,
  // was all companies: the Contacts group vanished and the total under it left
  // the contacts out (D80). Copied from a live company so every column the
  // table asks for is one it already accepts; removed afterwards.
  const crowd = `Crowd ${locale} ${Date.now()}`;
  const inserted = await query<{ id: string }>(
    `insert into companies
       (name, category_id, lead_source_id, country_id, city_id, city_text, rep_id, archived_at, archive_reason)
     select $1::text || ' ' || g, c.category_id, c.lead_source_id, c.country_id, c.city_id, c.city_text,
            c.rep_id, now(), 'crowd'
       from (select * from companies
              where archived_at is null and lead_from_id is null
              order by name limit 1) c
      cross join generate_series(1, $2::int) g
     returning id`,
    [crowd, LIST_LIMIT + 1],
  );

  try {
    const counts = await one<{ company: number; contact: number; project: number }>(
      `select (select count(*) from companies where archived_at is not null)::int as company,
              (select count(*) from contacts where archived_at is not null)::int as contact,
              (select count(*) from projects where archived_at is not null)::int as project`,
    );
    // Something of every kind is archived, or the groups below prove nothing.
    expect(counts.contact, "the seed archives no contact").toBeGreaterThan(0);
    expect(counts.project, "the seed archives no project").toBeGreaterThan(0);

    await login(page, locale, "jerom");
    await page.goto(`/${locale}/admin/archive`);
    await expect(page.getByRole("heading", { name: t("admin.archive") })).toBeVisible(COLD);

    const groups = [
      { kind: "company", heading: t("common.companies"), total: counts.company },
      { kind: "contact", heading: t("common.contacts"), total: counts.contact },
      { kind: "project", heading: t("common.projects"), total: counts.project },
    ];
    let drawn = 0;
    for (const group of groups) {
      const region = page.getByRole("region", { name: new RegExp(`^${group.heading}`) });
      await expect(region, `the ${group.kind} group is gone`).toBeVisible(COLD);
      // Its heading counts every archived thing of its kind, however many are drawn.
      await expect(region.getByRole("heading").locator("span")).toHaveText(String(group.total));
      const rows = await region.getByRole("listitem").count();
      expect(rows).toBeGreaterThan(0);
      expect(rows).toBeLessThanOrEqual(group.total);
      drawn += rows;
    }
    expect(drawn, "the companies group was not cut short").toBeLessThan(
      counts.company + counts.contact + counts.project,
    );

    // And the line under it adds every group, the contacts included.
    await expect(page.locator('[data-slot="list-tail"]')).toHaveText(
      t("common.showingFirst", { shown: drawn, total: counts.company + counts.contact + counts.project }),
    );
  } finally {
    await query("delete from companies where id = any($1::uuid[])", [inserted.map((row) => row.id)]);
  }
});

test("a folded record names the company it became, and the name opens it", async ({
  page,
  locale,
  t,
}) => {
  // The seeded fold: the tombstone, and the company that continues.
  const tomb = await one<{ name: string; intoId: string; into: string }>(
    `select c.name, m.id as "intoId", m.name as into
       from companies c join companies m on m.id = c.merged_into_id
      order by c.archived_at desc
      limit 1`,
  );

  await login(page, locale, "jerom");
  await page.goto(`/${locale}/admin/archive`);
  await expect(page.getByRole("heading", { name: t("admin.archive") })).toBeVisible(COLD);

  // "Folded into …" is a door where the admin may open the company (D121,
  // P13-G6), and it opens the survivor — not the tombstone, which is empty.
  const row = page.getByRole("listitem").filter({ hasText: tomb.name });
  const door = row.getByRole("link", { name: t("duplicates.foldedIntoShort", { name: tomb.into }) });
  await expect(door).toBeVisible(COLD);
  await door.click();
  await expect(page).toHaveURL(new RegExp(`[?&]open=${tomb.intoId}`), COLD);
  await expect(page.getByRole("dialog", { name: tomb.into })).toBeVisible(COLD);
});
