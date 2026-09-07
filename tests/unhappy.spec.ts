import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P11I — the unhappy paths: nothing silent, nothing lost (D132).
 *
 * Every server action guards itself and answers with a sentence when the work
 * fails. What it cannot guard is the wire: a rep in a lobby with no signal, a
 * deploy in the second he presses Save. That request never answers, the call
 * rejects, and unguarded the rejection went to the error boundary — the whole
 * screen became the error card, with his sentence still inside the form it
 * replaced. Here the wire is cut under a form, and what has to be true is
 * that the app says so where he is looking, keeps what he typed, and saves it
 * the moment the wire is back.
 */

const COLD = { timeout: 30_000 };

/** Every server action is a POST carrying the Next-Action header; cut those and nothing else. */
async function cutTheWire(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      return route.abort("connectionfailed");
    }
    return route.continue();
  });
}

async function mendTheWire(page: Page): Promise<void> {
  await page.unroute("**/*");
}

/** The request reaches the server and is answered; only the answer is lost on the way back. */
async function loseTheAnswer(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      const answer = await route.fetch().catch(() => null);
      await answer?.text().catch(() => null);
      return route.abort("connectionfailed");
    }
    return route.continue();
  });
}

async function openLog(page: Page, locale: string, t: (key: string) => string) {
  const company = await ownCompany();
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);
  await drawer
    .getByRole("group", { name: t("drawer.companyActions") })
    .getByRole("button", { name: t("common.log"), exact: true })
    .click();
  const form = page.getByRole("dialog", { name: t("drawer.logTitle") });
  await expect(form).toBeVisible(COLD);
  return { company, drawer, form, box: form.getByLabel(t("drawer.whatHappened")) };
}

async function ownCompany() {
  return one<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa' and c.archived_at is null
      order by c.created_at desc
      limit 1`,
  );
}

test("a log written with the server out of reach is kept, said, and saved when it is back", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  const company = await ownCompany();
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);
  await drawer
    .getByRole("group", { name: t("drawer.companyActions") })
    .getByRole("button", { name: t("common.log"), exact: true })
    .click();
  const form = page.getByRole("dialog", { name: t("drawer.logTitle") });
  await expect(form).toBeVisible(COLD);

  const written = `No signal in the lobby ${Date.now()}`;
  const box = form.getByLabel(t("drawer.whatHappened"));
  await box.fill(written);

  await test.step("the wire is cut: a sentence, the words kept, Save alive", async () => {
    await cutTheWire(page);
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("common.unreachable"))).toBeVisible(COLD);
    await expect(form, "the form went away with the words in it").toBeVisible();
    await expect(box).toHaveValue(written);
    await expect(form.getByRole("button", { name: t("common.save") })).toBeEnabled();
    // Not the error card: the screen behind the form is still the drawer.
    await expect(page.getByRole("heading", { name: t("shell.failedTitle") })).toHaveCount(0);
  });

  await test.step("the wire is back: the same press saves it", async () => {
    await mendTheWire(page);
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("drawer.logged"), { exact: true })).toBeVisible(COLD);
    await expect(form).toBeHidden();
    await expect(drawer.getByText(written)).toBeVisible(COLD);
  });
});

test("a company form the wire refused keeps its fields and says so in its footer", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
  const form = page.getByRole("dialog", { name: t("forms.addCompany") });
  const name = `Wire test ${Date.now()}`;
  const phone = `05${String(Date.now()).slice(-8)}`;
  await form.getByLabel(t("common.company")).fill(name);
  await form.getByLabel(t("common.phone")).fill(phone);

  await cutTheWire(page);
  await form.getByRole("button", { name: t("common.save") }).click();
  const footer = form.locator("[data-slot='form-footer']");
  await expect(footer.getByRole("alert")).toHaveText(t("common.unreachable"), COLD);
  await expect(form.getByLabel(t("common.company"))).toHaveValue(name);
  await expect(form.getByLabel(t("common.phone"))).toHaveValue(phone);
  await expect(page.getByRole("heading", { name: t("shell.failedTitle") })).toHaveCount(0);

  await mendTheWire(page);
  await form.getByRole("button", { name: t("common.cancel") }).click();
  await expect(form).toBeHidden();
});

test("a confirmation the wire refused says so and keeps its question open", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");
  const company = await ownCompany();
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);

  // Archive is a prompt with a reason; the wire is cut before the press.
  await drawer
    .getByRole("group", { name: t("drawer.companyActions") })
    .getByRole("button", { name: t("drawer.archive") })
    .click();
  const ask = page.getByRole("dialog", { name: t("drawer.archiveTitle", { name: company.name }) });
  await expect(ask).toBeVisible(COLD);
  await ask.getByLabel(t("drawer.archiveReason")).fill("A wire test, not a real reason");

  await cutTheWire(page);
  await ask.getByRole("button", { name: t("drawer.archive") }).click();
  // A confirmation says every whole-form refusal in the toast (confirm-dialog.tsx);
  // the question stays open with the reason still in it.
  await expect(page.getByText(t("common.unreachable"))).toBeVisible(COLD);
  await expect(ask).toBeVisible();
  await expect(ask.getByLabel(t("drawer.archiveReason"))).toHaveValue("A wire test, not a real reason");
  await expect(page.getByRole("heading", { name: t("shell.failedTitle") })).toHaveCount(0);

  await mendTheWire(page);
  await ask.getByRole("button", { name: t("common.cancel") }).click();
  await expect(ask).toBeHidden();
  // Nothing was archived: the company is still on the floor.
  await expect(drawer).toBeVisible();
});

test("a log whose answer was lost is written once, not twice", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");
  const { drawer, form, box } = await openLog(page, locale, t);
  const written = `Answer lost on the way back ${Date.now()}`;
  await box.fill(written);

  // The row lands; the rep is told nothing did, and presses Save again (D134).
  await loseTheAnswer(page);
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page.getByText(t("common.unreachable"))).toBeVisible(COLD);
  await expect(box).toHaveValue(written);
  // The row is already there: the second press has to find it, not add to it.
  const landed = await query<{ n: number }>(`select count(*)::int as n from activities where text = $1`, [written]);
  expect(landed[0].n, "the answer was lost but the request never landed").toBe(1);
  await mendTheWire(page);
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page.getByText(t("drawer.logged"), { exact: true })).toBeVisible(COLD);
  await expect(form).toBeHidden();
  await expect(drawer.getByText(written)).toBeVisible(COLD);

  const rows = await query<{ n: number }>(
    `select count(*)::int as n from activities where text = $1`,
    [written],
  );
  expect(rows[0].n, "the second press made a twin").toBe(1);
});

test("a form whose session has ended says so and keeps the words", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");
  const { form, box } = await openLog(page, locale, t);
  const written = `Typed before the session ended ${Date.now()}`;
  await box.fill(written);

  // This page's session alone: other workers are signed in as Faisal too.
  const token = (await page.context().cookies()).find((c) => c.name.endsWith("session-token"));
  expect(token, "no session cookie on the page").toBeTruthy();
  await query(`delete from sessions where session_token = $1`, [token!.value]);

  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page.getByText(t("common.signedOut"))).toBeVisible(COLD);
  await expect(form, "the form went away with the words in it").toBeVisible();
  await expect(box).toHaveValue(written);
  await expect(page.getByRole("heading", { name: t("shell.failedTitle") })).toHaveCount(0);
});

test("an entry unfiled and written again in the same words is a new entry", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  const first = await openLog(page, locale, t);
  const written = `Filed on the wrong day ${Date.now()}`;
  await first.box.fill(written);
  await first.form.getByRole("button", { name: t("common.save") }).click();
  await expect(first.form).toBeHidden(COLD);
  await expect(first.drawer.getByText(written)).toBeVisible(COLD);

  // An entry's day cannot be corrected in place (D70), so a wrong one is
  // unfiled and written again — the same words, from the same rep, at the same
  // company, well inside the two minutes a twin lives in (D134). The row that
  // is off the floor must not answer for the one replacing it.
  const row = page.locator("li").filter({ hasText: written }).first();
  await row.getByRole("button", { name: t("drawer.unfile") }).click();
  const confirm = page.getByRole("dialog", { name: t("drawer.unfileTitle") });
  await expect(confirm).toBeVisible(COLD);
  await confirm.getByRole("button", { name: t("drawer.unfile") }).click();
  await expect(confirm).toBeHidden(COLD);
  await expect(first.drawer.getByText(written)).toBeHidden(COLD);

  const again = await openLog(page, locale, t);
  await again.box.fill(written);
  await again.form.getByRole("button", { name: t("common.save") }).click();
  await expect(again.form).toBeHidden(COLD);
  await expect(
    again.drawer.getByText(written),
    "the unfiled entry answered for the one written to replace it",
  ).toBeVisible(COLD);
});
