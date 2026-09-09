import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { pickFirst } from "./helpers/pick";
import { formatPhone, storedE164 } from "@/lib/phone";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";

/**
 * Two records, one customer (P12-8, S14, S15, D158).
 *
 * "A company is always created even when it looks like a duplicate; nothing
 * blocks the rep." That is a property of the DETECTOR, not of its absence, and
 * this file walks both halves of the sentence: the rep saves and is stopped by
 * nothing, and the manager finds a pair on his screen a moment later.
 *
 * Three rulings, three walks, because they differ in exactly what they leave
 * behind: nothing, a tombstone, or a tombstone and a share.
 *
 * **Each run makes its own pair.** Both locale projects run against ONE seeded
 * database in file order (playwright.config.ts), so a walk that consumed a
 * seeded pair would leave the second run's screen empty. Every test here adds
 * its own company, on a number already on somebody's floor, and rules on that
 * one; the two seeded open pairs are read and never answered.
 */

const COLD = { timeout: 30_000 };

/**
 * A number on the floor that exactly ONE live company holds, and that company.
 *
 * Found at run time rather than written down. Both locale projects run against
 * one database in file order, and a number this file has already used is a
 * number two companies now hold — so a second run typing it would raise TWO
 * flags, and every assertion below about "the pair" would be about two of them.
 * The "exactly one" filter is what makes each walk's pair unambiguous, whichever
 * run it is and whatever the seed does next year.
 */
async function lonelyNumber(): Promise<{ phone: string; typed: string; company: string }> {
  // Never one of Saad's own: he is the rep who types the twin below, and a pair
  // whose other side is already his would make "he gains nothing" and "he is put
  // on the survivor's share list" both meaningless — a rep is not shared a
  // company he owns.
  const saad = await userId("saad@technopanel.com.sa");
  // Counted over EVERY live company first, then narrowed: a number Saad and
  // somebody else both held would pass a filter applied before the count and
  // then raise two flags, which is the shape this helper exists to avoid.
  const row = await one<{ phone: string; company: string }>(
    `select phone, company from (
       select ct.phone_normalized as phone,
              min(c.name) as company,
              min(c.rep_id::text) as rep,
              count(distinct c.id) as holders
         from contacts ct
         join companies c on c.id = ct.company_id
        where ct.archived_at is null and c.archived_at is null
        group by ct.phone_normalized
     ) held
      where holders = 1 and rep <> $1::text
      order by phone
      limit 1`,
    [saad],
  );
  return {
    phone: row.phone,
    // As a rep types it: the local Saudi shape the form accepts (D89).
    typed: "0" + row.phone.slice(4),
    company: row.company,
  };
}

/** Named for the run that made it, so the two locales never answer each other's. */
function twinName(locale: Locale, which: number): string {
  return `سدرة للصناعات المعدنية ${locale.toUpperCase()}${which}`;
}

/**
 * Saad opens a customer whose number Faisal already holds.
 *
 * The whole way in, through the form, because the flag is raised inside the
 * transaction that writes the row: a spec that inserted the company itself
 * would prove the screen and not the rule.
 */
async function addTwin(
  page: Page,
  t: Translate,
  name: string,
  phone: string,
): Promise<string> {
  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
  const form = page.getByRole("dialog", { name: t("forms.addCompany") });
  await form.getByLabel(t("common.company")).fill(name);
  await pickFirst(form.getByRole("combobox", { name: t("common.category") }));
  await pickFirst(form.getByRole("combobox", { name: t("common.leadSource") }));
  await form.getByLabel(t("common.name"), { exact: true }).fill("سعود المطرفي");
  await form.getByLabel(t("common.phone")).fill(phone);

  // Nothing blocks the save (S15): the warning is advice and Save is live.
  await expect(form.getByRole("button", { name: t("common.save") })).toBeEnabled();
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page.getByText(t("forms.added", { name }))).toBeVisible();

  // The toast and the navigation are two things: the dialog says "added" the
  // moment the action returns, and the drawer opens on the client push that
  // follows it (add-company-dialog.tsx). Reading the URL on the toast read it
  // one tick early and got no `open` at all.
  await expect(page).toHaveURL(/[?&]open=/, COLD);
  const id = new URL(page.url()).searchParams.get("open") ?? "";
  expect(id).not.toBe("");
  return id;
}

/** The one flag this company raised, and the other side of it. */
async function flagFor(companyId: string) {
  return one<{ id: string; other_id: string; status: string }>(
    `select id, case when company_id = $1::uuid then other_id else company_id end as other_id, status
       from duplicate_flags
      where $1::uuid in (company_id, other_id)`,
    [companyId],
  );
}

/** The card on the manager's screen that is about this pair. */
function cardFor(page: Page, name: string) {
  return page.getByRole("listitem").filter({ hasText: name });
}

test("the name is folded before it is compared, and the warning fires on a spelling nobody matched before", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "saad");
  await page.goto(`/${locale}/companies`);

  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
  const form = page.getByRole("dialog", { name: t("forms.addCompany") });

  /*
   * The stored name is «مصنع سدرة للصناعات المعدنية». What is typed here drops
   * the مصنع, drops the definite article, writes the ة as ه and puts a fatha on
   * the د — four things two people typing one Saudi customer disagree about,
   * and four different strings under the `ilike 'typed%'` rule this replaced.
   */
  await form.getByLabel(t("common.company")).fill("سدره للصناعات المعدنيَة");

  // It names the company it matched, which is what a rep decides by (D8).
  const warning = form.getByRole("status");
  await expect(warning).toContainText("سدرة", COLD);

  await form.getByRole("button", { name: t("common.cancel") }).click();
  await expect(form).toBeHidden();
});

test("a rep is stopped by nothing, and the pair is on the manager's screen a moment later", async ({
  page,
  locale,
  t,
}) => {
  const name = twinName(locale, 1);
  const held = await lonelyNumber();
  await login(page, locale, "saad");
  await page.goto(`/${locale}/companies`);
  const twinId = await addTwin(page, t, name, held.typed);

  // The row is on his floor, whole, with nothing withheld (S15).
  const saved = await one<{ rep_email: string; archived: boolean }>(
    `select u.email as rep_email, c.archived_at is not null as archived
       from companies c join users u on u.id = c.rep_id where c.id = $1::uuid`,
    [twinId],
  );
  expect(saved.rep_email).toBe("saad@technopanel.com.sa");
  expect(saved.archived).toBe(false);

  // And the manager was told, by the number and not by the name (D158).
  const flag = await flagFor(twinId);
  expect(flag.status).toBe("open");
  const other = await one<{ name: string }>("select name from companies where id = $1::uuid", [
    flag.other_id,
  ]);
  expect(other.name).toBe(held.company);

  // The rep is told nothing about it: it is a question he cannot answer.
  await page.goto(`/${locale}/duplicates`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);

  // The manager reads the pair side by side, with the number that raised it.
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/duplicates`);
  const card = cardFor(page, name);
  await expect(card).toBeVisible(COLD);
  await expect(card).toContainText(held.company);
  await expect(card.getByText(formatPhone(storedE164(held.phone)))).toBeVisible();

  // And it is on his own home screen, in the band that is his own work.
  await page.goto(`/${locale}/team`);
  const band = page.getByRole("heading", { name: t("duplicates.title") });
  await expect(band).toBeVisible();
});

test("one record continues: the work moves, the other is a tombstone, and its rep gains nothing", async ({
  page,
  locale,
  t,
}) => {
  const name = twinName(locale, 2);
  const held = await lonelyNumber();
  await login(page, locale, "saad");
  await page.goto(`/${locale}/companies`);
  const twinId = await addTwin(page, t, name, held.typed);
  const flag = await flagFor(twinId);
  const survivorId = flag.other_id;

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/duplicates`);
  const card = cardFor(page, name);
  await expect(card).toBeVisible(COLD);

  // Keep the one that has been on file longer — the side of the card that is
  // NOT the record this run just made.
  const keep = card
    .locator('[data-slot="duplicate-side"]')
    .filter({ hasText: held.company })
    .getByRole("button", { name: t("duplicates.keepThis") });
  await keep.click();
  const confirm = page.getByRole("dialog", {
    name: t("duplicates.keepTitle", { name: held.company }),
  });
  await confirm.getByRole("button", { name: t("duplicates.keepThis") }).click();
  await expect(page.getByText(t("duplicates.keptDone", { name: held.company }))).toBeVisible(
    COLD,
  );

  // The pair is answered and off his screen.
  await expect(cardFor(page, name)).toHaveCount(0, COLD);
  const ruled = await one<{ status: string; survivor_id: string }>(
    "select status, survivor_id from duplicate_flags where id = $1::uuid",
    [flag.id],
  );
  expect(ruled.status).toBe("kept");
  expect(ruled.survivor_id).toBe(survivorId);

  // The record that did not continue is a tombstone pointing at the one that
  // did, off the floor and not deleted (S16).
  const tomb = await one<{ merged_into_id: string; archived: boolean }>(
    "select merged_into_id, archived_at is not null as archived from companies where id = $1::uuid",
    [twinId],
  );
  expect(tomb.merged_into_id).toBe(survivorId);
  expect(tomb.archived).toBe(true);

  // Saad's own person on the customer moved across and is still Saad's.
  const moved = await one<{ n: string }>(
    `select count(*)::text as n from contacts c join users u on u.id = c.rep_id
      where c.company_id = $1::uuid and u.email = 'saad@technopanel.com.sa'
        and c.archived_at is null`,
    [survivorId],
  );
  expect(moved.n).toBe("1");

  // And he gained nothing else: this ruling is not the sharing one.
  const shares = await query(
    `select 1 from company_shares s join users u on u.id = s.user_id
      where s.company_id = $1::uuid and u.email = 'saad@technopanel.com.sa'`,
    [survivorId],
  );
  expect(shares).toHaveLength(0);
});

test("kept and shared: the same fold, and the rep who lost the record keeps the customer", async ({
  page,
  locale,
  t,
}) => {
  const name = twinName(locale, 3);
  const held = await lonelyNumber();
  await login(page, locale, "saad");
  await page.goto(`/${locale}/companies`);
  const twinId = await addTwin(page, t, name, held.typed);
  const flag = await flagFor(twinId);
  const survivorId = flag.other_id;

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/duplicates`);
  const card = cardFor(page, name);
  await expect(card).toBeVisible(COLD);

  const keep = card
    .locator('[data-slot="duplicate-side"]')
    .filter({ hasText: held.company })
    .getByRole("button", { name: t("duplicates.keepAndShare") });
  await keep.click();
  const confirm = page.getByRole("dialog", {
    name: t("duplicates.keepAndShareTitle", { name: held.company }),
  });
  await confirm.getByRole("button", { name: t("duplicates.keepAndShare") }).click();
  /*
   * The dialog closing IS the write having landed: ConfirmDialog keeps its
   * question open when the action refuses. Waiting on the card leaving the list
   * instead proved nothing — Radix hides everything behind an open modal from
   * the accessibility tree, so the count was already nought while the answer was
   * still in flight, and the next line read the flag before it was ruled on.
   */
  await expect(confirm).toBeHidden(COLD);
  await expect(cardFor(page, name)).toHaveCount(0, COLD);

  const ruled = await one<{ status: string }>(
    "select status from duplicate_flags where id = $1::uuid",
    [flag.id],
  );
  expect(ruled.status).toBe("keptAndShared");

  // Access to the customer, never ownership of the deals (§3, D147): a share
  // row, and the record still its own rep's.
  const share = await one<{ n: string }>(
    `select count(*)::text as n from company_shares s join users u on u.id = s.user_id
      where s.company_id = $1::uuid and u.email = 'saad@technopanel.com.sa'`,
    [survivorId],
  );
  expect(share.n).toBe("1");
  const owner = await one<{ email: string }>(
    `select u.email from companies c join users u on u.id = c.rep_id where c.id = $1::uuid`,
    [survivorId],
  );
  expect(owner.email).toBe("faisal@technopanel.com.sa");

  // Saad can read it now, which is the whole of what the third answer gave him.
  await login(page, locale, "saad");
  await page.goto(`/${locale}/companies?open=${survivorId}`);
  await expect(page.getByRole("dialog", { name: held.company })).toBeVisible(COLD);
});

test("not the same company: both records stay exactly as they are", async ({
  page,
  locale,
  t,
}) => {
  const name = twinName(locale, 4);
  const held = await lonelyNumber();
  await login(page, locale, "saad");
  await page.goto(`/${locale}/companies`);
  const twinId = await addTwin(page, t, name, held.typed);
  const flag = await flagFor(twinId);

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/duplicates`);
  const card = cardFor(page, name);
  await expect(card).toBeVisible(COLD);
  await card.getByRole("button", { name: t("duplicates.notTheSame") }).click();
  await page
    .getByRole("dialog", { name: t("duplicates.notTheSameTitle") })
    .getByRole("button", { name: t("duplicates.notTheSame") })
    .click();
  await expect(page.getByText(t("duplicates.notTheSameDone"))).toBeVisible(COLD);
  await expect(cardFor(page, name)).toHaveCount(0, COLD);

  // Nothing moved and nothing left the floor: two firms with one number between
  // them is a thing that happens, and the answer changes no record.
  const ruled = await one<{ status: string; survivor_id: string | null }>(
    "select status, survivor_id from duplicate_flags where id = $1::uuid",
    [flag.id],
  );
  expect(ruled.status).toBe("notDuplicate");
  expect(ruled.survivor_id).toBeNull();
  const live = await query<{ id: string }>(
    "select id from companies where id in ($1::uuid, $2::uuid) and archived_at is null",
    [twinId, flag.other_id],
  );
  expect(live).toHaveLength(2);

  // And it is remembered: the pair index allows one row per pair for ever, so
  // the detector's next run offers this pair and is refused by the database
  // rather than by a read before the write (tests/schema.spec.ts proves that
  // half; this proves there is still exactly one row for the pair).
  const rows = await query(
    `select 1 from duplicate_flags
      where least(company_id, other_id) = least($1::uuid, $2::uuid)
        and greatest(company_id, other_id) = greatest($1::uuid, $2::uuid)`,
    [twinId, flag.other_id],
  );
  expect(rows).toHaveLength(1);
});

test("a tombstone says what it became and can never be brought back", async ({
  page,
  locale,
  t,
}) => {
  // The seeded fold, read by both runs and answered by neither.
  const tomb = await one<{ id: string; name: string; into: string }>(
    `select c.id, c.name, m.name as into
       from companies c join companies m on m.id = c.merged_into_id
      where c.name = 'انماء للمقاولات'`,
  );

  // Its own rep opens it and reads what happened to his record.
  await login(page, locale, "turki");
  await page.goto(`/${locale}/companies?open=${tomb.id}`);
  const drawer = page.getByRole("dialog", { name: tomb.name });
  await expect(drawer).toBeVisible(COLD);
  await expect(drawer.locator('[data-slot="folded-band"]')).toContainText(tomb.into);

  // The admin's archive screen says the same thing and offers no way back.
  await login(page, locale, "jerom");
  await page.goto(`/${locale}/admin/archive`);
  const row = page.getByRole("listitem").filter({ hasText: tomb.name });
  await expect(row).toBeVisible(COLD);
  await expect(row).toContainText(t("admin.restoreMerged"));
  await expect(row.getByRole("button", { name: t("admin.restore") })).toHaveCount(0);

  // The company archived for a reason still has its way back, so the sentence
  // above is about tombstones and not about the screen.
  const ordinary = page.getByRole("listitem").filter({ hasText: "مؤسسة الرواد للألمنيوم" });
  await expect(ordinary.getByRole("button", { name: t("admin.restore") })).toBeVisible();
});
