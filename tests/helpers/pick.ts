import { expect, type Locator } from "@playwright/test";

/**
 * Choose the first entry of a searchable dropdown, without racing the one that
 * is closing (P11E gate, `quotations.spec` in Arabic).
 *
 * Eleven specs did this as "click the combobox, click the first option on the
 * page". Two pickers in a row — fire rating, then class — is where that broke
 * once under load: the class list opened while the fire-rating list was still
 * animating out, the page's first `option` belonged to the old list, the click
 * landed on nothing, and Save was refused for a class left on "Choose…". The
 * pick is held to the list that belongs to THIS combobox: opened, chosen from
 * the newest listbox, and closed again before the next field is touched.
 */
export async function pickFirst(combobox: Locator): Promise<void> {
  const page = combobox.page();
  await combobox.click();
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("listbox").last().getByRole("option").first().click();
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
}
