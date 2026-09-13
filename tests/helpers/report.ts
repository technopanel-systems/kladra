import { expect, type Locator, type Page } from "@playwright/test";
import type { Channel } from "@/db/schema";
import { one } from "./db";
import type { Locale, Translate } from "./i18n";
import { pressChip } from "./pick";

/**
 * The report popup, the one way a report is written (SPEC §3 P13, 13.8).
 *
 * Every spec that writes one — from the top bar, a customer's drawer, a job, a
 * call card — ends in the same three answers, and eleven specs wrote the old
 * log dialog's one box out by hand. The popup asks for two more things than
 * that box did, so the answers are written down once here.
 */

const COLD = { timeout: 20_000 };

/** The popup, by the name it opens under (a correction opens under its own). */
export function reportDialog(page: Page, t: Translate): Locator {
  return page.getByRole("dialog", { name: t("common.addReport") });
}

/**
 * An outcome as the popup offers it: a row the admin keeps, named in the
 * reader's language — so read from the table, never typed here in two scripts.
 */
export async function outcomeName(locale: Locale, english = "Reached"): Promise<string> {
  const row = await one<{ name: string }>(
    `select case when $2::text = 'ar' then outcomes.name_ar else outcomes.name_en end as name
       from outcomes
      where outcomes.name_en = $1::text`,
    [english, locale],
  );
  return row.name;
}

export type ReportAnswers = {
  kind?: Channel;
  /** The outcome's English name, as the admin's list is seeded (scripts/seed/lookups.ts). */
  outcome?: string;
  text: string;
};

/** What happened, what came of it, and the line — without sending it. */
export async function answerReport(
  dialog: Locator,
  t: Translate,
  locale: Locale,
  { kind = "visit", outcome = "Reached", text }: ReportAnswers,
): Promise<void> {
  await expect(dialog).toBeVisible(COLD);
  await pressChip(dialog, t(`common.${kind}`));
  await pressChip(dialog, await outcomeName(locale, outcome));
  await dialog.getByLabel(t("reports.dialog.text")).fill(text);
}

/**
 * The three answers and Save, waiting for the POPUP TO CLOSE — the words are in
 * the box as well as, a moment later, in the list, so a text assertion alone
 * passes while the write is still in flight.
 */
export async function writeReport(
  dialog: Locator,
  t: Translate,
  locale: Locale,
  answers: ReportAnswers,
): Promise<void> {
  await answerReport(dialog, t, locale, answers);
  await dialog.getByRole("button", { name: t("common.save") }).click();
  await expect(dialog).toBeHidden(COLD);
}
