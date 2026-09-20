import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { choose, pickFirst } from "./helpers/pick";
import { test, expect } from "./helpers/i18n";

/**
 * P14 — a paper may name more than one store (SPEC §3, P14).
 *
 * The founder, after a third round of use: "A quotation or a dispatch may name
 * more than one warehouse. Not per line — that would confuse the reps — but the
 * document as a whole takes one warehouse normally and allows a second or a
 * third in the rare case. Quotations and dispatches both, and the dispatch
 * difference flag compares the warehouses as it compares the panels and the
 * services."
 *
 * Three claims, and all three are here: the rare case can be typed and comes
 * back off the database as two stores in the order it was typed in; the
 * ordinary case is untouched — one picker, no second question; and a load out
 * of somewhere its paper did not name says so on the drawer, in the same
 * section that says a price changed.
 *
 * The third is read off the seed (q11 is priced out of Riyadh and Malham and
 * d7 leaves from Malham alone), because a flag that only ever appears on a row
 * a test made is a flag nobody has seen on a screen (rules/data.md).
 */

const COLD = { timeout: 30_000 };

test("a paper may be priced out of a second store, and it comes back saying both", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const project = await one<{
    name: string;
    company_name: string;
    contact: string;
  }>(
    `select p.name, c.name as company_name,
            (select ct.name from contacts ct
              where ct.company_id = c.id and ct.archived_at is null
              order by ct.created_at limit 1) as contact
       from projects p
       join companies c on c.id = p.company_id
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and c.archived_at is null and p.archived_at is null and p.lost_at is null
      order by p.created_at, p.id
      limit 1`,
  );
  const stores = await query<{ id: number; name_en: string; name_ar: string }>(
    `select id, name_en, name_ar from warehouses where active order by sort_order, id limit 2`,
  );
  expect(stores.length, "the seed has fewer than two stores to choose between").toBe(2);
  const named = (index: number) =>
    locale === "ar" ? stores[index].name_ar : stores[index].name_en;

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);
  await page.getByRole("button", { name: t("quotations.request") }).first().click();

  const form = page.getByRole("dialog", { name: t("quotations.request") });
  const companyPicker = form.getByRole("combobox", { name: t("common.company") });
  await expect(companyPicker).toBeVisible(COLD);
  await choose(page, companyPicker, project.company_name);
  await choose(page, form.getByRole("combobox", { name: t("common.project") }), project.name);
  await choose(page, form.getByRole("combobox", { name: t("common.contact") }), project.contact);

  // The field a rep sees first is the field he always saw: one store, and one
  // quiet offer under it.
  await expect(form.getByRole("combobox", { name: t("common.anotherWarehouse") })).toHaveCount(0);
  await choose(page, form.getByRole("combobox", { name: t("common.warehouse") }), named(0));

  await form.getByRole("button", { name: t("common.addWarehouse") }).click();
  const second = form.getByRole("combobox", { name: t("common.anotherWarehouse") });
  await expect(second).toBeVisible();
  // The store already named is not offered twice: two names for one store is
  // one store (P14).
  await second.click();
  await expect(page.getByRole("option", { name: named(0), exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await choose(page, second, named(1));

  // One whole line, the way the other request specs fill one, or Save is
  // refused and this proves nothing.
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.qty")).first().fill("10");
  await form.getByLabel(t("common.pricePerSqm")).fill("100");
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
  await expect(page).toHaveURL(/\/quotations\?open=/, COLD);

  // The drawer says both, in the order he typed them.
  const id = new URL(page.url()).searchParams.get("open") ?? "";
  const sheet = page.getByRole("dialog").first();
  const store = sheet.locator('[data-slot="stores"]');
  await expect(store).toContainText(named(0), COLD);
  await expect(store).toContainText(named(1));

  // And the row behind the words: the first store on the paper's own column,
  // where it has always been, and the second in the table beside it (P14).
  const paper = await one<{ warehouse_id: number }>(
    `select warehouse_id from quotations where id = $1::uuid`,
    [id],
  );
  expect(paper.warehouse_id, "the first store is not on the paper's own column").toBe(stores[0].id);
  const others = await query<{ warehouse_id: number; position: number }>(
    `select warehouse_id, position from quotation_warehouses
      where quotation_id = $1::uuid order by position`,
    [id],
  );
  expect(others).toEqual([{ warehouse_id: stores[1].id, position: 1 }]);
});

test("a load out of a store its paper did not name is flagged like a changed price", async ({
  page,
  locale,
  t,
}) => {
  // The seed's own two-store paper and the load that leaves from one of them
  // (q11 and d7): read by what they are rather than by their keys.
  const load = await one<{ id: string; number: number }>(
    `select d.id, d.number
       from dispatches d
       join quotations q on q.id = d.quotation_id
      where exists (select 1 from quotation_warehouses qw where qw.quotation_id = q.id)
        and jsonb_path_exists(d.quotation_difference, '$[*] ? (@.field == "warehouses")')
      order by d.number
      limit 1`,
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/dispatches?open=${load.id}`);

  const sheet = page.getByRole("dialog").first();
  const differs = sheet.locator('[data-slot="differs"]');
  await expect(differs).toBeVisible(COLD);

  // Its own entry, wearing the load rather than a line number: the stores are
  // named on the whole load and never per line (P14).
  const entry = differs.locator('li[data-change-of="load"]');
  await expect(entry).toHaveCount(1);
  const field = entry.locator("li[data-field]");
  await expect(field).toHaveAttribute("data-field", "warehouses");
  await expect(field).toContainText(t("common.warehouse"));

  const name = locale === "ar" ? "w.name_ar" : "w.name_en";
  const leaves = await one<{ name: string }>(
    `select ${name} as name from warehouses w
      where w.id = (select warehouse_id from dispatches where id = $1::uuid)`,
    [load.id],
  );
  // The paper's own stores, lowest id first, which is the one order the flag
  // records them in — so that the same two stores are one string whichever way
  // round they were typed (src/lib/dispatch-difference.ts).
  const paper = await query<{ name: string }>(
    `select ${name} as name from warehouses w
      where w.id in (
        select q.warehouse_id from dispatches d
          join quotations q on q.id = d.quotation_id
         where d.id = $1::uuid
        union
        select qw.warehouse_id from dispatches d
          join quotation_warehouses qw on qw.quotation_id = d.quotation_id
         where d.id = $1::uuid
      )
      order by w.id`,
    [load.id],
  );
  expect(paper.length, "the seeded paper this reads is not the two-store one").toBe(2);

  // What it says now, and what the paper said, as an aside — the same shape as
  // a price that changed, so the desk reads one section and not two.
  await expect(field).toContainText(leaves.name);
  await expect(field).toContainText(
    t("quotations.changedWas", { from: paper.map((store) => store.name).join(" · ") }),
  );
});
