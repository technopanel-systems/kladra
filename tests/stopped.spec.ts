import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * The day's waiting list says what kind of waiting, and each kind is a door
 * (P11E finding 85).
 *
 * On the volume floor the list said "83" and drew twenty-five cards, oldest
 * first whatever their kind, so a quotation a customer had held for a month
 * sat above yesterday's send-back that had the coordinator blocked — and
 * nothing on the screen said that most of the eighty-three were customers
 * thinking, not work stopped on the rep. The heading carries the kinds as
 * pills now, stopped work sorts first, and each pill opens the list under that
 * status. This holds them together: the pill's number is the cards of that kind
 * (the seeded list is under the cap, so every row is drawn), the first card is
 * stopped work, and the door lands on exactly that many rows.
 *
 * Since P12-7 there is a fourth kind and it is the one with no door: a lead
 * given to this rep has no screen of its own for him, so its pill is counted
 * and not a link, and the list under the heading IS its list. The pills must
 * still add up to the cards, which is the part that would have broken silently
 * (§5 #170).
 *
 * Reads only, so nothing to put back.
 */

const COLD = { timeout: 30_000 };

test("the waiting list sorts stopped work first and its pills open their own lists", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/day`);
  await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: new RegExp(`^${t("day.waitingOnYou")}`) }),
  });
  await expect(section).toHaveCount(1);
  const cards = section.getByRole("listitem");
  const drawn = await cards.count();
  expect(drawn, "the seeded floor has something waiting on Faisal").toBeGreaterThan(0);

  // Every kind's pill counts the cards wearing that badge — the count is the
  // rows it shows (D108). The seeded list is short, so every row is drawn.
  const kinds = [
    { key: "newLead", badge: t("day.newLead"), href: null },
    { key: "sentBack", badge: t("day.sentBack"), href: "status=returned" },
    { key: "refused", badge: t("day.refused"), href: "status=refused" },
    { key: "withCustomer", badge: t("day.withCustomer"), href: "status=issued" },
  ] as const;
  const counted: Record<string, number> = {};
  for (const kind of kinds) {
    const n = await cards.filter({ has: page.getByText(kind.badge, { exact: true }) }).count();
    counted[kind.key] = n;
    const pill = section.getByRole("group").getByText(t(`day.${kind.key}Count`, { count: n }));
    await expect(pill).toBeVisible();
    if (n > 0 && kind.href) await expect(pill).toHaveAttribute("href", new RegExp(kind.href));
  }
  // Every card wears one of these badges, so the pills add up to the list. A
  // kind with no pill would leave the figure beside the heading larger than the
  // numbers that split it, and nothing else would say so.
  expect(counted.newLead + counted.sentBack + counted.refused + counted.withCustomer).toBe(drawn);

  // Stopped work first: whichever stopped kind exists, the first card is one of
  // them and no customer-held quotation sits above it. A new lead is stopped
  // work too — a customer promised a call — and sorts above all of them.
  const stopped = counted.newLead + counted.sentBack + counted.refused;
  if (stopped > 0) {
    const firstBadge = cards.first().locator('[data-slot="state-badge"], span').filter({
      hasText: new RegExp(`^(${t("day.newLead")}|${t("day.sentBack")}|${t("day.refused")})$`),
    });
    await expect(firstBadge.first()).toBeVisible();
    for (let i = 0; i < stopped; i += 1) {
      await expect(cards.nth(i)).not.toContainText(t("day.withCustomer"));
    }
  }

  // The door: the sent-back pill opens the quotations list under that status
  // with that many rows — the same definition on both screens.
  const sentBack = counted.sentBack;
  expect(sentBack, "the demo seed leaves one of Faisal's quotations sent back").toBeGreaterThan(0);
  await section.locator('[data-slot="waiting-sentBack"]').click();
  await expect(page).toHaveURL(/status=returned/);
  await expect(page.getByRole("heading", { name: t("common.quotations") })).toBeVisible(COLD);
  await expect(page.locator("table tbody tr")).toHaveCount(sentBack);
});
