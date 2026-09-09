import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Choosing from a searchable dropdown, held to the list this control opened.
 *
 * Two failures, one shape, three phases apart.
 *
 * Eleven specs did this as "click the combobox, click the first option on the
 * page". Two pickers in a row — fire rating, then class — is where that broke
 * once under load: the class list opened while the fire-rating list was still
 * animating out, the page's first `option` belonged to the old list, the click
 * landed on nothing, and Save was refused for a class left on "Choose…"
 * (P11E gate). So the pick is held to the newest listbox, and the control is
 * closed again before the next field is touched.
 *
 * And in P12-10's gate the same walk hung for ninety seconds on an Arabic
 * screen: the option resolved, was "not stable" twice while the popover was
 * still settling over a form that had grown two fields above it, and was then
 * detached — after which the wait was for a list nobody was drawing any more,
 * because a click that lands where a popover has just left is a click outside
 * it, and outside is how a popover is dismissed. A retry costs a second and a
 * hang costs the run, so this opens it again rather than waiting on a list that
 * has gone. Three goes, then the failure stands.
 *
 * `choose` is the same act by name rather than by position, and it was written
 * out by hand in three specs before it was written down here.
 */
async function takeFrom(trigger: Locator, option: () => Locator): Promise<void> {
  const page = trigger.page();
  for (let attempt = 0; ; attempt += 1) {
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    try {
      // Short, because the list is already open: what this is waiting for is
      // one click, and anything longer is waiting for a list that has closed.
      await option().click({ timeout: 5_000 });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      return;
    } catch (cause) {
      if (attempt === 2) throw cause;
      // Only if it is still open. Escape on a closed popover reaches the dialog
      // behind it and shuts the form the walk is filling in.
      if ((await trigger.getAttribute("aria-expanded")) === "true") {
        await page.keyboard.press("Escape");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
      }
    }
  }
}

/** The first option in the list this combobox opens. */
export async function pickFirst(combobox: Locator): Promise<void> {
  await takeFrom(combobox, () =>
    combobox.page().getByRole("listbox").last().getByRole("option").first(),
  );
}

/**
 * The option carrying this exact text, scoped to the popover's own content
 * (`src/components/ui/popover.tsx`) rather than searched across the whole page:
 * the list screen a dialog sits on top of shows these very same labels — a
 * quotation's own number on the dispatches list, a project's name on the
 * quotations list — and an open dialog does not stop Playwright from seeing the
 * text underneath it.
 */
export async function choose(page: Page, trigger: Locator, label: string): Promise<void> {
  await takeFrom(trigger, () =>
    page.locator('[data-slot="popover-content"]').getByText(label, { exact: true }).first(),
  );
}
