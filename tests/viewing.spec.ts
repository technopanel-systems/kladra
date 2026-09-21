import { login } from "./helpers/auth";
import { personName, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * What view-as is FOR, and the three places it stopped being it (Stage-3 audit,
 * M3).
 *
 * `tests/view-as.spec.ts` is the safety half: only an admin may start it, no
 * write goes through while it is on, and the banner is never quiet. This is the
 * other half, which nothing was asking — that the thing he opened it to do is
 * the thing it lets him do. Jerom is the founder and not a developer; view-as
 * is how he checks a screen he will never see himself, and DESIGN §5 says a
 * control is absent rather than present and refusing. Three ways that failed
 * at once while he was reading the sales manager's screens:
 *
 * 1. Users offered him Add user, Edit, Reset password and Deactivate, and every
 *    one of them was refused by `requireActor` the moment he pressed it.
 * 2. Duplicates — the manager's OWN queue, and the screen Jerom would most want
 *    to look at — bounced him to his own home, because its gate asked who may
 *    RULE a pair rather than who may read the list.
 * 3. And the theme, which is a cookie belonging to the browser he is sitting at
 *    and nobody's record at all, was refused with everything else — so the one
 *    reader who opened the app to check how a screen LOOKS was the one reader
 *    who could not change how it looked.
 *
 * Everything this walk changes goes back in the `finally`: it stops viewing,
 * and it takes the audit row its own press wrote off the trail, because the
 * suite shares one seeded database.
 */

const COLD = { timeout: 30_000 };

const BANNER = "[data-slot='viewing-banner']";

test("Jerom reads the sales manager's screens: nothing to press, everything to see", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // A sign-in, view-as, four screens and a theme change.

  const start = new Date();
  const manager = {
    id: await userId("abdulrahman@technopanel.com.sa"),
    name: await personName("abdulrahman@technopanel.com.sa", locale),
  };

  await login(page, locale, "jerom");

  try {
    await test.step("0 · as himself, the users screen offers the work", async () => {
      // The control for everything below: an absence proves nothing until the
      // same screen has been seen carrying the thing that is missing.
      await page.goto(`/${locale}/admin/users`);
      await expect(page.getByRole("heading", { name: t("common.users") })).toBeVisible(COLD);
      await expect(page.getByRole("button", { name: t("admin.addUser") })).toBeVisible();
      await expect(
        page.getByRole("row").filter({ hasText: manager.name }).getByRole("button", {
          name: t("common.moreFor", { name: manager.name }),
        }),
      ).toBeVisible();

      const row = page.getByRole("row").filter({ hasText: manager.name });
      await row.getByRole("button", { name: t("viewAs.start") }).click();
      const dialog = page.getByRole("dialog", { name: t("viewAs.title", { name: manager.name }) });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: t("viewAs.start") }).click();
      await expect(page.locator(BANNER)).toBeVisible(COLD);
    });

    await test.step("1 · the users screen is a list and nothing else", async () => {
      await page.goto(`/${locale}/admin/users`);
      await expect(page.getByRole("heading", { name: t("common.users") })).toBeVisible(COLD);
      // He came to read it, and it is all still here.
      await expect(page.getByRole("row").filter({ hasText: manager.name })).toBeVisible();

      await expect(
        page.getByRole("button", { name: t("admin.addUser") }),
        "Add user was offered to a viewer, and the action refuses one",
      ).toHaveCount(0);
      // Edit, Reset password and Deactivate live in the row's menu, so the menu
      // itself is what must not be there: a menu of three refusals is worse
      // than no menu (DESIGN §5).
      await expect(
        page.getByRole("button", { name: t("common.moreFor", { name: manager.name }) }),
        "a row menu was offered to a viewer",
      ).toHaveCount(0);
      // And no way to become a third person from inside somebody else's eyes.
      await expect(page.getByRole("button", { name: t("viewAs.start") })).toHaveCount(0);
    });

    await test.step("2 · holidays and leave is the same: the calendar, and no way to change it", async () => {
      await page.goto(`/${locale}/admin/holidays`);
      await expect(page.getByRole("heading", { name: t("common.holidays") })).toBeVisible(COLD);
      // The month strip is the reason he opened it, and it is drawn.
      await expect(page.locator('[data-slot="holidays-month"]')).toBeVisible();
      await expect(
        page.getByRole("button", { name: t("admin.addDay") }),
        "Add a day was offered to a viewer",
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: t("admin.removeDay"), exact: true }),
        "Remove was offered to a viewer",
      ).toHaveCount(0);
    });

    await test.step("3 · the duplicates queue opens, and carries no ruling", async () => {
      const open = await query("select 1 from duplicate_flags where status = 'open'");

      await page.goto(`/${locale}/duplicates`);
      // The manager's own queue, read through his eyes. It used to redirect,
      // because its gate asked who may RULE rather than who may read.
      await expect(
        page.getByRole("heading", { name: t("duplicates.title") }),
        "the duplicates queue sent a viewer home instead of showing him the list",
      ).toBeVisible(COLD);
      await expect(page).toHaveURL(new RegExp(`/${locale}/duplicates`));

      if (open.length === 0) {
        // Nothing to rule, so nothing below would mean anything: the screen
        // says the desk is clear and this step has had its answer.
        await expect(page.getByText(t("duplicates.empty"))).toBeVisible();
        return;
      }

      await expect(page.locator('[data-slot="duplicate-pair"]').first()).toBeVisible();
      /*
       * OWED — this fails until `src/components/duplicates/duplicate-list.tsx`
       * takes the fact the page already has. The page is gated by who may SEE
       * the queue; the three answers are a write and belong to whoever may
       * RULE it (`mayHandOver`, which says no to a viewer). The list component
       * is not this builder's file: it needs a required `mayRule: boolean`
       * prop that drops the two ConfirmDialogs inside `Side` and the
       * "Not the same company" one under the pair, and the page passes
       * `mayRule={mayHandOver(user)}`.
       */
      for (const label of ["duplicates.keepThis", "duplicates.keepAndShare", "duplicates.notTheSame"]) {
        await expect(
          page.getByRole("button", { name: t(label) }),
          `${label} was offered to a viewer, and ruleDuplicateAction refuses one`,
        ).toHaveCount(0);
      }
    });

    await test.step("4 · and he can still change the theme, which is what he came for", async () => {
      await page.goto(`/${locale}/team`);
      await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
      // Dark is the default and the context is fresh, so this is where it
      // starts (src/lib/theme.ts).
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      await page
        .getByRole("button", { name: t("shell.accountMenuFor", { name: manager.name }) })
        .click();
      await page.getByRole("menuitemradio", { name: t("common.light") }).click();

      // The cookie belongs to this browser, not to the person being viewed, so
      // there is nothing here for `requireActor` to protect (M3).
      await expect(
        page.locator("html"),
        "a viewer could not change the theme, which is a cookie and nobody's record",
      ).toHaveAttribute("data-theme", "light", COLD);
    });
  } finally {
    const banner = page.locator(BANNER);
    if ((await banner.count()) > 0) {
      await banner.getByRole("button", { name: t("viewAs.stop") }).click();
      await expect(banner).toHaveCount(0, COLD);
    }
    await query(
      `delete from audit_log
        where record_type = 'user' and record_id = $1::text
          and action in ('view.start', 'view.stop') and at >= $2::timestamptz`,
      [manager.id, start.toISOString()],
    );
  }
});
