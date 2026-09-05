import { expect, test } from "./helpers/i18n";

const COLD = { timeout: 20_000 };
const ADDRESS = "faisal@technopanel.com.sa";

/**
 * The one screen a signed-out person can reach, and therefore the first thing
 * any of the fourteen sees (D67).
 *
 * It was built before the app had its own surfaces and drifted out of them: a
 * second copy of the mark in a colour that changes between themes, the only
 * component-library card left in the app, and no heading of any level — a
 * `CardTitle` is a div, so the public page offered a screen reader nothing to
 * land on. The three assertions here are the three that would have caught it.
 */
test("the sign-in screen: a heading, an address that runs the right way, and no jump", async ({
  page,
  locale,
  t,
}) => {
  await page.context().clearCookies();
  await page.goto(`/${locale}/login`);

  const email = page.getByLabel(t("auth.email"));
  const password = page.getByLabel(t("auth.password"));
  const submit = page.getByRole("button", { name: t("auth.signIn") });

  await test.step("1 · one heading, and it is the thing you came here to do", async () => {
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveCount(1, COLD);
    await expect(heading).toHaveText(t("auth.signIn"));
  });

  await test.step("2 · both credentials are Latin and run left to right", async () => {
    // The page runs right to left in Arabic; an address and a password do not.
    await expect(email).toHaveAttribute("dir", "ltr");
    await expect(password).toHaveAttribute("dir", "ltr");
  });

  await test.step("3 · a refusal answers without moving the screen", async () => {
    const mark = page.locator("header").first();
    const before = await mark.boundingBox();
    expect(before, "no wordmark on the sign-in screen").not.toBeNull();

    await email.fill(ADDRESS);
    await password.fill("not the password");
    await submit.click();

    // By id, not by role: Next keeps its own always-present route announcer,
    // which is also an alert, and the one under the fields is the one the
    // fields point at with aria-describedby.
    const alert = page.locator("#login-error");
    await expect(alert).toHaveText(t("auth.wrongCredentials"), COLD);

    // The card grows by a line when the answer arrives, and the whole block is
    // centred on the canvas — so the wordmark used to rise 18px and the
    // language link fall 18px while somebody was reading why they were
    // refused. The line is in the layout from the start now.
    const after = await mark.boundingBox();
    expect(after?.y, "the screen moved under the answer").toBe(before?.y);

    // And what he typed on a phone is still there to correct.
    await expect(email).toHaveValue(ADDRESS);
    await expect(password).toHaveValue("");
  });
});
