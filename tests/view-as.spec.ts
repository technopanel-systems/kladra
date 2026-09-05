import { login } from "./helpers/auth";
import { one } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { mayWrite } from "@/lib/floor";
import type { SessionUser } from "@/lib/types";
import { mayViewAs, shouldView } from "@/lib/view-as";

/**
 * The admin looking at the app as somebody else (SPEC §3, P8.8).
 *
 * This is impersonation, so what is checked is not that it works — that part is
 * visible the moment you press it — but the three things that make it safe, and
 * every one of them is invisible when it is wrong:
 *
 * 1. only an admin can start it, and the check is on the REAL session;
 * 2. nothing can be written while it is on, whatever the screen offers;
 * 3. it is never quiet — the banner is in the layout, on every screen.
 */

const COLD = { timeout: 30_000 };

test("only an admin may look through somebody else's eyes", () => {
  expect(mayViewAs("admin")).toBe(true);
  expect(mayViewAs("manager")).toBe(false);
  expect(mayViewAs("coordinator")).toBe(false);
  expect(mayViewAs("rep")).toBe(false);

  // A cookie is honoured only when the real signed-in person is an admin, so
  // forging one changes nothing for anybody else.
  expect(shouldView("rep", "me", "somebody")).toBe(false);
  expect(shouldView("manager", "me", "somebody")).toBe(false);
  expect(shouldView("admin", "me", "somebody")).toBe(true);
  // An admin "viewing" himself is not viewing: no banner, and he can still work.
  expect(shouldView("admin", "me", "me")).toBe(false);
  expect(shouldView("admin", "me", undefined)).toBe(false);
});

test("viewing is reading: the floor rule says no while it is on", () => {
  const faisal: SessionUser = {
    id: "faisal",
    name: "Faisal",
    email: "f@x",
    role: "rep",
    locale: "en",
  };
  // His own floor, as himself.
  expect(mayWrite(faisal, "faisal")).toBe(true);
  // The same floor, seen through his eyes by an admin: no.
  expect(mayWrite({ ...faisal, viewedBy: { id: "jerom", name: "Jerom" } }, "faisal")).toBe(false);
});

test("Jerom checks a rep's screen, changes nothing, and stops", async ({ page, locale, t }) => {
  test.slow();

  const faisal = await one<{ id: string; name: string }>(
    "select id, name from users where email = 'faisal@technopanel.com.sa'",
  );

  await login(page, locale, "jerom");

  await test.step("1 · he starts it from the list of people, where he already is", async () => {
    await page.goto(`/${locale}/admin/users`);
    await expect(page.getByRole("heading", { name: t("common.users") })).toBeVisible(COLD);

    const row = page.getByRole("row").filter({ hasText: faisal.name });
    await row.getByRole("button", { name: t("viewAs.start") }).click();

    const dialog = page.getByRole("dialog", { name: t("viewAs.title", { name: faisal.name }) });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: t("viewAs.start") }).click();
  });

  await test.step("2 · every screen says whose it is, and says nothing can change", async () => {
    const banner = page.locator("[data-slot='viewing-banner']");
    await expect(banner).toBeVisible(COLD);
    await expect(banner).toContainText(faisal.name);
    await expect(banner).toContainText(t("common.readOnly"));

    // Not one screen: the banner is in the layout, so it is on all of them.
    for (const screen of ["day", "companies", "projects", "quotations"]) {
      await page.goto(`/${locale}/${screen}`);
      await expect(
        page.locator("[data-slot='viewing-banner']"),
        `no banner on /${screen}`,
      ).toBeVisible(COLD);
    }
  });

  await test.step("3 · he is reading Faisal's floor, not his own", async () => {
    // The admin has no companies; Faisal has his. Landing on the rep's day at
    // all is the proof, because /day sends anybody who is not a rep away.
    await page.goto(`/${locale}/day`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible();
  });

  await test.step("4 · a write on a screen he is looking at does nothing", async () => {
    // Marking notifications read is the shortest write in the app — one press,
    // no form — so it is the one this asks with. What refuses it is not the
    // button: it is `requireActor`, the single door every write goes through,
    // which is why a screen that forgot to hide a control is still safe.
    const unread = async () =>
      (
        await one<{ count: string }>(
          `select count(*)::text as count from notifications
            where user_id = $1::uuid and read_at is null`,
          [faisal.id],
        )
      ).count;

    const before = await unread();

    await page.goto(`/${locale}/notifications`);
    await expect(page.getByRole("heading", { name: t("common.notifications") })).toBeVisible(COLD);

    const mark = page.getByRole("button", { name: t("common.markAllRead") });
    if (await mark.isVisible().catch(() => false)) await mark.click();
    expect(await unread(), "a notification was marked read while viewing").toBe(before);

    // And the drawers offer no work at all, the same way they do for a manager
    // reading somebody's floor (D42): the floor rule answers no while viewing,
    // so nothing has to remember to hide anything.
    await page.goto(`/${locale}/companies`);
    await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
    await page.getByRole("table").first().getByRole("link").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible(COLD);
    for (const label of ["common.log", "common.edit", "drawer.archive"]) {
      await expect(
        page.getByRole("dialog").first().getByRole("button", { name: t(label) }),
        `${label} was offered while viewing`,
      ).toHaveCount(0);
    }

    // The drawer is closed before the next step: everything behind an open one
    // is inert, the banner included.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0, COLD);
  });

  await test.step("5 · Stop gives him his own screen back", async () => {
    await page
      .locator("[data-slot='viewing-banner']")
      .getByRole("button", { name: t("viewAs.stop") })
      .click();

    await expect(page.locator("[data-slot='viewing-banner']")).toHaveCount(0, COLD);
    // And he is himself: the team screen is his home, and a rep cannot open it.
    await page.goto(`/${locale}/team`);
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
  });
});

test("a manager is offered no way to become somebody else", async ({ page, locale, t }) => {
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/admin/users`);

  // Not his screen at all — the admin section is the admin's (D15).
  await expect(page).toHaveURL(new RegExp(`/${locale}/team`), COLD);
  await expect(page.getByRole("button", { name: t("viewAs.start") })).toHaveCount(0);
});
