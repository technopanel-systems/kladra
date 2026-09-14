import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

const COLD = { timeout: 30_000 };

/**
 * The notifications list is capped at fifty, and a capped list says so (D80).
 *
 * The seed never gives anybody fifty notices, so without this the sentence
 * would exist in both languages and never once be drawn. The notices are
 * written read, so nobody's bell changes while they are there, and they are
 * deleted in `finally`, because every later file shares this database.
 */
test("a list cut at fifty says how many there are and where the rest went", async ({
  page,
  locale,
  t,
}) => {
  const manager = await userId("abdulrahman@technopanel.com.sa");
  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<{ id: string }>(
    "select id from companies where archived_at is null order by created_at limit 1",
  );
  const marker = `cap-${locale}`;
  const before = await one<{ n: number }>(
    "select count(*)::int as n from notifications where user_id = $1::uuid",
    [manager],
  );
  const extra = 55;

  try {
    await query(
      `insert into notifications (user_id, kind, params, link, subject_type, subject_id, read_at)
       select $1::uuid, 'leadAcknowledged', jsonb_build_object('repId', $2::text, 'marker', $3::text),
              '/companies', 'company', $4::uuid, now()
       from generate_series(1, $5::int)`,
      [manager, faisal, marker, company.id, extra],
    );
    const total = before.n + extra;

    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/notifications`);
    await expect(page.getByRole("heading", { name: t("common.notifications") })).toBeVisible(COLD);

    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(50);
    await expect(page.locator('[data-slot="list-tail"]')).toHaveText(
      t("notifications.olderNotShown", { shown: 50, total }),
    );
  } finally {
    await query("delete from notifications where user_id = $1::uuid and params->>'marker' = $2", [
      manager,
      marker,
    ]);
  }
});
