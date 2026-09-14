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
 * land on. The first three steps are the three that would have caught it; the
 * last two are the answers the form gives while it works and when the server
 * cannot be reached (S12.1).
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

  // Busy is not disabled (S12.1, states-feedback). The button greyed itself
  // out while the answer was on its way: out of the Tab order, focus dropped,
  // and a button that looked as if it had stopped working.
  await test.step("4 · while it works the button says so, stays pressable, and a second press is not a second sign-in", async () => {
    let calls = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
      calls += 1;
      await held;
      return route.continue();
    });

    await password.fill("not the password");
    await submit.click();
    const busy = page.getByRole("button", { name: t("auth.signingIn") });
    await expect(busy).toHaveAttribute("aria-busy", "true", COLD);
    await expect(busy, "the working button left the Tab order").toBeEnabled();
    await busy.focus();
    await expect(busy).toBeFocused();
    await busy.click();

    release();
    // Back to its own words once the answer is in — and by then a second
    // sign-in, had the press made one, would have gone through the route too.
    // Counted by the busy words going, not by "Sign in" arriving: in Arabic the
    // one is inside the other («جارٍ تسجيل الدخول…»).
    await expect(busy).toHaveCount(0, COLD);
    await expect(page.locator("#login-error")).toHaveText(t("auth.wrongCredentials"));
    expect(calls, "a second press signed in twice").toBe(1);
    await page.unroute("**/*");
  });

  await test.step("5 · a server it cannot reach is said in the sign-in screen's own words", async () => {
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        return route.abort("connectionfailed");
      }
      return route.continue();
    });
    await password.fill("not the password");
    await submit.click();

    await expect(page.locator("#login-error")).toHaveText(t("auth.unreachable"), COLD);
    // Nothing was said about the fields, because the server said nothing.
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveValue(ADDRESS);
    await page.unroute("**/*");
  });
});
