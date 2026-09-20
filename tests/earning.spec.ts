import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { choose, pickFirst } from "./helpers/pick";
import { test, expect } from "./helpers/i18n";

/**
 * P14 — a target says who earns (SPEC §3, P14).
 *
 * The founder, after a third round of use: "A rep whose target is zero earns no
 * share of any quotation or dispatch. Beside the target is a tick that lets a
 * zero-target person share anyway. A rep with no target is support, not sales:
 * they may raise work without it counting. Make this visible wherever credit is
 * chosen, so nobody wonders where the metres went."
 *
 * Three claims, and all three are here: he is not offered as an answer, the
 * form says so in words rather than leaving a name quietly off a list, and the
 * paper he raises is written with no credit on it at all. Then the tick, which
 * is the one press that puts him back.
 *
 * Turki is the seed's support man this month (`SUPPORT_THIS_MONTH`), so the
 * state is on the floor rather than made by this file; what the file makes is
 * the OTHER side of it, by ticking the box and taking it away again.
 */

const COLD = { timeout: 30_000 };

/** Turki, whom the seed leaves without a target this month. */
async function support(): Promise<string> {
  const row = await one<{ id: string }>(
    `select id from users where email = 'turki@technopanel.com.sa'`,
  );
  return row.id;
}

/** The current Riyadh month, as the target row spells it. */
const MONTH = `date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)::date`;

test("a rep with no target this month raises the work, and it counts for nobody", async ({
  page,
  locale,
  t,
}) => {
  test.slow();
  const turki = await support();

  const has = await query(
    `select 1 from targets where user_id = $1::uuid and month = ${MONTH}`,
    [turki],
  );
  expect(has.length, "the seed gave Turki a target this month — he is not support any more").toBe(0);

  const project = await one<{
    id: string;
    name: string;
    company_id: string;
    company_name: string;
  }>(
    `select p.id, p.name, c.id as company_id, c.name as company_name
       from projects p
       join companies c on c.id = p.company_id
      where c.rep_id = $1::uuid
        and c.archived_at is null and p.archived_at is null and p.lost_at is null
      order by p.created_at, p.id
      limit 1`,
    [turki],
  );
  const person = await one<{ name: string }>(
    `select name from contacts where company_id = $1::uuid and archived_at is null
      order by created_at limit 1`,
    [project.company_id],
  );
  const warehouse = await one<{ name_en: string; name_ar: string }>(
    `select name_en, name_ar from warehouses where active order by sort_order, id limit 1`,
  );
  const store = locale === "ar" ? warehouse.name_ar : warehouse.name_en;

  await login(page, locale, "turki");
  await page.goto(`/${locale}/quotations`);
  await page.getByRole("button", { name: t("quotations.request") }).first().click();

  const form = page.getByRole("dialog", { name: t("quotations.request") });
  const companyPicker = form.getByRole("combobox", { name: t("common.company") });
  await expect(companyPicker).toBeVisible(COLD);
  await choose(page, companyPicker, project.company_name);
  await choose(page, form.getByRole("combobox", { name: t("common.project") }), project.name);
  await choose(page, form.getByRole("combobox", { name: t("common.contact") }), person.name);

  // In words, where the question would have been asked (P14). Not an empty
  // control and not silence: the founder's "nobody wonders where the metres
  // went".
  await expect(form.locator("[data-slot='credit-none']")).toHaveText(
    t("common.credit.earnsNothing"),
    COLD,
  );

  // One whole line, the way `tests/create.spec.ts` fills one: the warehouse and
  // the nine boxes a panel needs, or Save is refused and this proves nothing.
  await choose(page, form.getByRole("combobox", { name: t("common.warehouse") }), store);
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.qty")).first().fill("10");
  await form.getByLabel(t("common.pricePerSqm")).fill("100");
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
  await expect(page).toHaveURL(/\/quotations\?open=/, COLD);

  // And the paper itself: raised, and credited to nobody.
  const id = new URL(page.url()).searchParams.get("open") ?? "";
  const credits = await query(`select user_id from quotation_credits where quotation_id = $1::uuid`, [
    id,
  ]);
  expect(credits.length, "a rep with no target was credited his own paper").toBe(0);
  const raised = await one<{ rep_id: string }>(
    `select rep_id::text from quotations where id = $1::uuid`,
    [id],
  );
  expect(raised.rep_id, "the paper is not on the man who raised it").toBe(turki);
});

test("the tick beside the target puts a zero-target rep back among the answers", async ({
  page,
  locale,
  t,
}) => {
  test.slow();
  const turki = await support();

  // The admin's tick, as the admin's own screen writes it: a row at nought with
  // `shares` true. Taken away again at the end, whatever happens here.
  await query(
    `insert into targets (user_id, month, sqm, shares)
     values ($1::uuid, ${MONTH}, '0.00', true)
     on conflict (user_id, month) do update set sqm = '0.00', shares = true`,
    [turki],
  );

  try {
    const project = await one<{ name: string; company_name: string; contact: string }>(
      `select p.name, c.name as company_name,
              (select ct.name from contacts ct
                where ct.company_id = c.id and ct.archived_at is null
                order by ct.created_at limit 1) as contact
         from projects p
         join companies c on c.id = p.company_id
        where c.rep_id = $1::uuid
          and c.archived_at is null and p.archived_at is null and p.lost_at is null
        order by p.created_at, p.id
        limit 1`,
      [turki],
    );

    await login(page, locale, "turki");
    await page.goto(`/${locale}/quotations`);
    await page.getByRole("button", { name: t("quotations.request") }).first().click();

    const form = page.getByRole("dialog", { name: t("quotations.request") });
    const companyPicker = form.getByRole("combobox", { name: t("common.company") });
    await expect(companyPicker).toBeVisible(COLD);
    await choose(page, companyPicker, project.company_name);
    await choose(page, form.getByRole("combobox", { name: t("common.project") }), project.name);
    await choose(page, form.getByRole("combobox", { name: t("common.contact") }), project.contact);

    // Nothing said, because there is nothing to say: he earns his own paper's
    // metres again, and a job one person works asks no question at all.
    await expect(form.locator("[data-slot='credit-none']")).toHaveCount(0);
    await expect(form.locator("[data-slot='credit-without-target']")).toHaveCount(0);
  } finally {
    await query(`delete from targets where user_id = $1::uuid and month = ${MONTH}`, [turki]);
  }
});
