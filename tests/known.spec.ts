import { dayOf, formatDay } from "@/lib/dates";
import { login } from "./helpers/auth";
import { one, personName } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * A company that comes back is recognised (SPEC S16, D109; P11D finding 73).
 *
 * The archive existed so that a customer somebody gave up on would be known
 * when he resurfaced, and why. The duplicate check never read it: an archived
 * company was typed in again as a stranger, and the reason was shown to nobody.
 * Now the warning fires for an archived match too and carries the day it left
 * and the reason typed then; a live match says where the company is and when
 * it was last worked. Neither blocks the save (S15).
 *
 * The archived fixture is the one the demo seed keeps (D106), read from the
 * database rather than named here, so a renamed seed cannot make this pass for
 * nothing. Nothing is written, so there is nothing to put back.
 */

const COLD = { timeout: 30_000 };

type Archived = {
  name: string;
  reason: string | null;
  archived_at: Date;
  phone: string;
  rep_email: string;
};

type Live = {
  name: string;
  rep_email: string;
  city: string | null;
  last_activity: string | null;
};

test("an archived company warns as it is typed, with the day it left and the reason", async ({
  page,
  locale,
  t,
}) => {
  const known = await one<Archived>(
    `select c.name, c.archive_reason as reason, c.archived_at,
            ct.phone_normalized as phone, u.email as rep_email
       from companies c
       join users u on u.id = c.rep_id
       join contacts ct on ct.company_id = c.id and ct.archived_at is null
      where c.archived_at is not null
      order by c.archived_at desc, ct.created_at asc
      limit 1`,
  );
  expect(known.reason, "the demo keeps one archived company with its reason (D106)").toBeTruthy();
  const rep = await personName(known.rep_email, locale);
  const left = formatDay(dayOf(known.archived_at), locale);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
  const form = page.getByRole("dialog", { name: t("forms.addCompany") });
  // The number is the strongest sign two records are one company (S14), and it
  // is typed in the shape it is stored in — one of the accepted shapes.
  await form.getByLabel(t("common.phone")).fill(known.phone);

  const warning = form.getByRole("status");
  await expect(warning).toContainText(
    t("forms.duplicateArchived", { name: known.name, rep, date: left }),
  );
  await expect(warning).toContainText(known.reason ?? "");
  // Advice, never a gate.
  await expect(form.getByRole("button", { name: t("common.save") })).toBeEnabled();
});

test("a live match says where the company is and when it was last worked", async ({
  page,
  locale,
  t,
}) => {
  // Somebody else's customer with a log entry, so both facts have a value.
  const known = await one<Live>(
    `select c.name, u.email as rep_email,
            coalesce(${locale === "ar" ? "ci.name_ar" : "ci.name_en"}, c.city_text) as city,
            (select max(a.happened_on)::text from activities a
              where a.company_id = c.id and a.archived_at is null) as last_activity
       from companies c
       join users u on u.id = c.rep_id
       left join cities ci on ci.id = c.city_id
      where c.archived_at is null
        and u.email <> 'faisal@technopanel.com.sa'
        and exists (select 1 from activities a where a.company_id = c.id and a.archived_at is null)
      order by c.name
      limit 1`,
  );
  const rep = await personName(known.rep_email, locale);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
  const form = page.getByRole("dialog", { name: t("forms.addCompany") });
  await form.getByLabel(t("common.company")).fill(known.name);

  const warning = form.getByRole("status");
  await expect(warning).toContainText(t("forms.duplicateCompany", { name: known.name, rep }));
  if (known.city) await expect(warning).toContainText(known.city);
  await expect(warning).toContainText(
    t("forms.duplicateLastActivity", { date: formatDay(known.last_activity, locale) }),
  );
  await expect(form.getByRole("button", { name: t("common.save") })).toBeEnabled();

  // Somebody else's company is not his to open (S8): no door, and the warning
  // has already named who has it (D121).
  await expect(warning.locator('[data-slot="open-match"]')).toHaveCount(0);
});

test("a match on his own floor is a door: the company opens over the form, and the form stays", async ({
  page,
  locale,
  t,
}) => {
  // One of Faisal's own live companies, by name.
  const mine = await one<{ name: string }>(
    `select c.name
       from companies c
       join users u on u.id = c.rep_id
      where c.archived_at is null and u.email = 'faisal@technopanel.com.sa'
      order by c.name
      limit 1`,
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
  const form = page.getByRole("dialog", { name: t("forms.addCompany") });
  await form.getByLabel(t("common.company")).fill(mine.name);

  // The warning is a door (D121, P11F): the company it names opens over the
  // form, and the form is still there, still full, when the drawer closes —
  // deciding "is this the same firm" needs the record, not a memory of it.
  const warning = form.getByRole("status");
  const door = warning.locator('[data-slot="open-match"]');
  await expect(door).toHaveText(t("forms.openMatch", { name: mine.name }));
  await door.click();
  const drawer = page.getByRole("dialog", { name: mine.name });
  await expect(drawer).toBeVisible(COLD);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(form).toBeVisible();
  await expect(form.getByLabel(t("common.company"))).toHaveValue(mine.name);
});
