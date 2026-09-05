import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";

/**
 * P6 — the admin's screens (WORKFLOW §3, Jerom).
 *
 * Jerom is the founder, not a developer. These six screens are what stop Kladra
 * from needing one: a new person can be given an account, anybody's password
 * can be reset, targets can be set, the lists behind the dropdowns can be
 * edited, a holiday can be added, the data can be taken out as CSV, and
 * anything archived can be put back.
 *
 * The walk below is one person's morning, in order, and every step is checked
 * where it lands rather than where it was typed: a target set here is read back
 * off the team screen, a holiday added here is read back out of Faisal's pace,
 * and the account created here is signed into.
 */

/** A cold screen behind a fresh query; the suite's default 5s is for a click. */
const COLD = { timeout: 30_000 };

const NEW_PASSWORD = "kladra-first-day";
const RESET_PASSWORD = "kladra-second-day";

/** A row of the first table on the screen, by the text in it. */
function row(page: Page, name: string): Locator {
  return page.getByRole("table").first().getByRole("row").filter({ hasText: name }).first();
}

/** A card in one of the admin's lists, by the text in it. */
function card(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({ hasText: name }).first();
}

/** Riyadh's today, as the app computes it (rules/data.md). */
function todayRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Friday and Saturday are the weekend (SPEC S47, src/lib/workdays.ts). */
function isWeekend(day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 5 || w === 6;
}

async function openAdmin(page: Page, locale: string, path: string, heading: string) {
  await page.goto(`/${locale}/admin/${path}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible(COLD);
}

/** Signs in with a password this test chose, without asserting it works. */
async function trySignIn(page: Page, locale: string, t: Translate, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto(`/${locale}/login`);
  await page.getByLabel(t("auth.email")).fill(email);
  await page.getByLabel(t("auth.password")).fill(password);
  await page.getByRole("button", { name: t("auth.signIn") }).click();
}

/** "12 / 21" out of the pace cell, whatever the surrounding punctuation. */
function paceOf(text: string): { elapsed: number; total: number } {
  const [elapsed, total] = text.match(/\d+/g)?.map(Number) ?? [];
  return { elapsed, total };
}

test("Jerom's morning: an account, a target, a list, a holiday, an export and a restore", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // Both locales run against the same database in one pass, so the names this
  // test types carry the locale — otherwise the second run trips over the
  // account the first one made.
  const suffix = locale.toUpperCase();
  const person = `Majed ${suffix}`;
  const email = `majed.${locale}@technopanel.com.sa`;
  const categoryEn = `Facade contractor ${suffix}`;
  const categoryAr = `مقاول واجهات ${suffix}`;
  // A lookup row reads as its values on one line — for a category, both
  // languages — and that is the name the confirm dialog says back.
  const category = `${categoryEn} · ${categoryAr}`;
  const holidayNote = `Founding day ${suffix}`;

  await login(page, locale, "jerom");

  await test.step("1 · his home is the manager's screen, plus an Admin section", async () => {
    // D15: the admin sees what the manager sees and an Admin menu on top of it.
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
    for (const label of [
      t("common.users"),
      t("common.targets"),
      t("common.lookups"),
      t("common.holidays"),
      t("admin.archive"),
      t("common.export"),
    ]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
        `${label} is not in the rail`,
      ).toBeVisible();
    }
  });

  await test.step("2 · a new rep gets an account, and it works", async () => {
    await openAdmin(page, locale, "users", t("common.users"));

    await page.getByRole("button", { name: t("admin.addUser") }).click();
    const form = page.getByRole("dialog", { name: t("admin.addUser") });
    await form.getByLabel(t("common.name")).fill(person);
    await form.getByLabel(t("common.email")).fill(email);
    await form.getByLabel(t("admin.newPassword")).fill(NEW_PASSWORD);
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("admin.userAdded", { name: person }))).toBeVisible(COLD);
    await expect(row(page, person)).toBeVisible();

    // Rep by default, and active: the two things the admin did not have to say.
    const saved = await one<{ role: string; active: boolean }>(
      "select role, active from users where email = $1::text",
      [email],
    );
    expect(saved.role).toBe("rep");
    expect(saved.active).toBe(true);
  });

  await test.step("3 · Majed signs in with the password Jerom read out", async () => {
    await trySignIn(page, locale, t, email, NEW_PASSWORD);
    // A rep's home is his day (D15, D49) — which is how the test knows the
    // account is not merely a row but a working sign-in.
    await expect(page).toHaveURL(/\/day/, COLD);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible();

    const majed = await one<{ id: string }>("select id from users where email = $1::text", [email]);
    const open = await query("select 1 from sessions where user_id = $1::uuid", [majed.id]);
    expect(open.length, "signing in did not create a database session").toBe(1);
  });

  await test.step("4 · a password reset signs him out everywhere and the old one dies", async () => {
    const majed = await one<{ id: string; password_hash: string }>(
      "select id, password_hash from users where email = $1::text",
      [email],
    );

    await login(page, locale, "jerom");
    await openAdmin(page, locale, "users", t("common.users"));
    await row(page, person).getByRole("button", { name: t("admin.resetPassword") }).click();

    const ask = page.getByRole("dialog", { name: t("admin.resetPasswordTitle", { name: person }) });
    await ask.getByLabel(t("admin.newPassword")).fill(RESET_PASSWORD);
    await ask.getByRole("button", { name: t("admin.resetPassword") }).click();
    await expect(page.getByText(t("admin.passwordReset", { name: person }))).toBeVisible(COLD);

    const after = await one<{ password_hash: string }>(
      "select password_hash from users where id = $1::uuid",
      [majed.id],
    );
    expect(after.password_hash).not.toBe(majed.password_hash);
    // A reset that leaves the open sessions signed in is not a reset (D17).
    const open = await query("select 1 from sessions where user_id = $1::uuid", [majed.id]);
    expect(open.length).toBe(0);

    await trySignIn(page, locale, t, email, NEW_PASSWORD);
    await expect(page.getByText(t("auth.wrongCredentials"))).toBeVisible(COLD);

    await trySignIn(page, locale, t, email, RESET_PASSWORD);
    await expect(page).toHaveURL(/\/day/, COLD);
  });

  await test.step("5 · deactivating keeps the person and closes the door", async () => {
    await login(page, locale, "jerom");
    await openAdmin(page, locale, "users", t("common.users"));

    await row(page, person).getByRole("button", { name: t("admin.deactivate") }).click();
    const ask = page.getByRole("dialog", { name: t("admin.deactivateTitle", { name: person }) });
    await ask.getByRole("button", { name: t("admin.deactivate") }).click();
    await expect(page.getByText(t("admin.deactivated", { name: person }))).toBeVisible(COLD);

    // Still on the list, marked by a word rather than by a colour (S7, DESIGN §4).
    await expect(row(page, person)).toContainText(t("admin.inactive"));
    const still = await query("select 1 from users where email = $1::text", [email]);
    expect(still.length, "the account was deleted rather than deactivated").toBe(1);

    await trySignIn(page, locale, t, email, RESET_PASSWORD);
    await expect(page.getByText(t("auth.wrongCredentials"))).toBeVisible(COLD);
  });

  await test.step("6 · a target set here is the figure on the team screen", async () => {
    const faisal = await one<{ id: string; name: string }>(
      "select id, name from users where email = 'faisal@technopanel.com.sa'",
    );
    const month = todayRiyadh().slice(0, 8) + "01";

    await login(page, locale, "jerom");
    await openAdmin(page, locale, "targets", t("common.targets"));

    const box = page.getByLabel(faisal.name);
    await expect(box).toBeVisible(COLD);
    await box.fill("2500");
    // Each box saves on its own, so the Save that matters is the one beside it.
    await page.locator(".card-face").filter({ has: box }).getByRole("button", {
      name: t("common.save"),
    }).click();
    await expect(page.getByText(t("admin.targetSaved"))).toBeVisible(COLD);

    const saved = await one<{ sqm: string }>(
      "select sqm::text as sqm from targets where user_id = $1::uuid and month = $2::date",
      [faisal.id, month],
    );
    expect(Number(saved.sqm)).toBe(2500);

    await page.goto(`/${locale}/team`);
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
    // Western digits and an ASCII comma in both languages (D6).
    await expect(row(page, faisal.name)).toContainText("2,500");
  });

  await test.step("7 · a new company category is added, and can be taken out of use", async () => {
    await openAdmin(page, locale, "lookups", t("common.lookups"));

    await page.getByRole("button", { name: t("admin.addRow") }).click();
    const form = page.getByRole("dialog", { name: t("admin.addRow") });
    await form.getByLabel(t("admin.inEnglish")).fill(categoryEn);
    await form.getByLabel(t("admin.inArabic")).fill(categoryAr);
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("admin.rowSaved"))).toBeVisible(COLD);
    await expect(card(page, category)).toBeVisible();

    const saved = await one<{ id: number; active: boolean }>(
      "select id, active from company_categories where name_en = $1::text",
      [categoryEn],
    );
    expect(saved.active).toBe(true);

    // Nothing is deleted: a category a company already carries has to keep
    // reading correctly, so it is only taken out of use (D21).
    await card(page, category).getByRole("button", { name: t("admin.hide") }).click();
    const ask = page.getByRole("dialog", { name: t("admin.hideTitle", { name: category }) });
    await ask.getByRole("button", { name: t("admin.hide") }).click();
    // The row itself, not the toast: "Saved." is the same sentence for every
    // one of these and two of them stack.
    await expect(card(page, category)).toContainText(t("admin.hidden"), COLD);

    const off = await one<{ active: boolean }>(
      "select active from company_categories where id = $1::int",
      [saved.id],
    );
    expect(off.active).toBe(false);

    // Back in use, so the second locale's run and the rep test below find the
    // list as they expect it.
    await card(page, category).getByRole("button", { name: t("admin.show") }).click();
    await page
      .getByRole("dialog", { name: t("admin.showTitle", { name: category }) })
      .getByRole("button", { name: t("admin.show") })
      .click();
    await expect(card(page, category)).not.toContainText(t("admin.hidden"), COLD);
  });

  await test.step("8 · a holiday next week takes a day out of everyone's month", async () => {
    const today = todayRiyadh();
    const month = today.slice(0, 7);
    const taken = new Set(
      (
        await query<{ day: string }>(
          "select to_char(day, 'YYYY-MM-DD') as day from non_working_days",
        )
      ).map((r) => r.day),
    );

    // A working day still to come in this month — a weekend or a day already
    // off would change no denominator and prove nothing.
    let holiday: string | null = null;
    for (let d = addDays(today, 1); d.slice(0, 7) === month; d = addDays(d, 1)) {
      if (!isWeekend(d) && !taken.has(d)) {
        holiday = d;
        break;
      }
    }

    if (!holiday) return; // The last working day of the month: nothing left to take.

    const faisal = await one<{ name: string }>(
      "select name from users where email = 'faisal@technopanel.com.sa'",
    );
    await page.goto(`/${locale}/team`);
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
    const before = paceOf(await row(page, faisal.name).locator("[data-slot='figure-pace']").innerText());

    await openAdmin(page, locale, "holidays", t("common.holidays"));
    await page.getByRole("button", { name: t("admin.addDay") }).click();

    const form = page.getByRole("dialog", { name: t("admin.addDay") });
    // `data-day` is react-day-picker's own ISO stamp, so this reads no
    // localized number and cares about no calendar script.
    await form.locator("#day-picker").click();
    await page.locator(`[data-day="${holiday}"] button`).first().click();
    await form.getByLabel(t("common.note")).fill(holidayNote);
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("admin.dayAdded"))).toBeVisible(COLD);

    const added = await one<{ user_id: string | null; day: string }>(
      "select user_id, to_char(day, 'YYYY-MM-DD') as day from non_working_days where note = $1::text",
      [holidayNote],
    );
    // No name on it, so it is everybody's; a name would make it one person's
    // leave (S48).
    expect(added.user_id).toBeNull();
    expect(added.day).toBe(holiday);

    await page.goto(`/${locale}/team`);
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
    const after = paceOf(await row(page, faisal.name).locator("[data-slot='figure-pace']").innerText());

    // The month got one working day shorter and the days already worked did
    // not move — a rep is not behind because of a holiday nobody worked (S48).
    expect(after.total, "the pace denominator ignored the holiday").toBe(before.total - 1);
    expect(after.elapsed).toBe(before.elapsed);
  });

  await test.step("9 · the three exports open in Excel with Arabic intact", async () => {
    const arabicName = await one<{ name: string }>(
      "select name from companies where name ~ '[\\u0600-\\u06FF]' order by name limit 1",
    );

    for (const name of ["companies", "quotations", "dispatches"]) {
      const response = await page.request.get(`/api/export/${name}`);
      expect(response.status(), `${name} did not download`).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/csv");

      const body = await response.body();
      // EF BB BF. Without it Excel reads the file in the system codepage and
      // every Arabic name opens as mojibake — which is the whole of D19.
      expect([body[0], body[1], body[2]], `${name} has no byte-order mark`).toEqual([
        0xef, 0xbb, 0xbf,
      ]);
      // CRLF, for the same reason: Excel is the reader this file is for.
      expect(body.toString("utf8"), `${name} is not CRLF`).toContain("\r\n");
    }

    const companiesCsv = (await (await page.request.get("/api/export/companies")).body()).toString(
      "utf8",
    );
    expect(companiesCsv, "an Arabic company name did not survive the export").toContain(
      arabicName.name,
    );
  });

  await test.step("10 · an archived company comes back with everything on it", async () => {
    // Archived through the app, by the rep who owns it, so what is restored is
    // a real archive and not a row this test wrote (D24).
    const target = await one<{ id: string; name: string }>(
      `select companies.id, companies.name from companies
         join users on users.id = companies.rep_id
        where users.email = 'faisal@technopanel.com.sa' and companies.archived_at is null
        order by companies.created_at desc limit 1`,
    );

    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${target.id}`);
    const drawer = page.getByRole("dialog", { name: target.name });
    await expect(drawer).toBeVisible(COLD);
    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("drawer.archive") })
      .click();
    await page
      .getByRole("dialog", { name: t("drawer.archiveTitle", { name: target.name }) })
      .getByRole("button", { name: t("drawer.archive") })
      .click();
    await expect(page.getByText(t("drawer.archived", { name: target.name }))).toBeVisible(COLD);

    const gone = await one<{ archived_at: string | null }>(
      "select archived_at from companies where id = $1::uuid",
      [target.id],
    );
    expect(gone.archived_at).not.toBeNull();

    await login(page, locale, "jerom");
    await openAdmin(page, locale, "archive", t("admin.archive"));
    await expect(card(page, target.name)).toBeVisible(COLD);

    await card(page, target.name).getByRole("button", { name: t("admin.restore") }).click();
    await page
      .getByRole("dialog", { name: t("admin.restoreTitle", { name: target.name }) })
      .getByRole("button", { name: t("admin.restore") })
      .click();
    await expect(page.getByText(t("admin.restored", { name: target.name }))).toBeVisible(COLD);

    const back = await one<{ archived_at: string | null }>(
      "select archived_at from companies where id = $1::uuid",
      [target.id],
    );
    expect(back.archived_at, "archive is only 'not delete' while restore works").toBeNull();
  });
});

/**
 * The admin screens are the admin's, and a rep who guesses a URL is not shown
 * an error page — he is put back on his own floor (DESIGN §5).
 */
test("a rep who types an admin URL lands on his own home, and cannot download the data", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");

  for (const path of ["users", "targets", "lookups", "holidays", "export", "archive"]) {
    await page.goto(`/${locale}/admin/${path}`);
    await expect(page, `/admin/${path} let a rep in`).toHaveURL(/\/day/, COLD);
  }
  await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible();

  // The export is a URL, not a menu item, so the refusal has to live on the
  // route and not only in the rail.
  for (const name of ["companies", "quotations", "dispatches"]) {
    const response = await page.request.get(`/api/export/${name}`);
    expect(response.status(), `a rep downloaded ${name}`).toBe(404);
  }

  await test.step("and what the admin adds to a list is offered to him at once", async () => {
    const categories = await query<{ name: string }>(
      `select case when $1::text = 'ar' then name_ar else name_en end as name
         from company_categories where active order by name_en`,
      [locale],
    );

    // Add company is on his company list, and his home is his day (D49).
    await page.goto(`/${locale}/companies`);
    await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
    await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
    const form = page.getByRole("dialog", { name: t("forms.addCompany") });
    await form.getByRole("combobox", { name: t("common.category") }).click();

    const offered = (await page.getByRole("option").allInnerTexts()).map((s) => s.trim());
    for (const name of categories) {
      expect(offered, `${name.name} is on the list but not in the dropdown`).toContain(name.name);
    }
  });
});
