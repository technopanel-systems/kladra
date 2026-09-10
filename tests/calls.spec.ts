import type { Locator, Page } from "@playwright/test";
import { todayRiyadh } from "@/lib/dates";
import { formatPhone, storedE164, telHref, whatsappHref } from "@/lib/phone";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * A number on screen is a message and a call (SPEC D98, P11A-11).
 *
 * "Calls due" offered WhatsApp and no way to place a call, and a call card
 * with no contact and no number said nothing where the customer list already
 * said "No contact yet". `PhoneLinks` (src/components/ui-ext/phone-links.tsx)
 * is now the one shape drawn everywhere a phone appears — the day's call
 * cards, the customer list and the drawer's Contacts tab — and `call-band.tsx`
 * draws the same "No contact yet" a card with nobody to call. Separately, the
 * SMAC-number prompts (issue, approve, both corrections) now carry the
 * customer's name under the title, in `PromptDialog`'s
 * `[data-slot="dialog-context"]`.
 *
 * House style follows tests/rep.spec.ts (Faisal's day, the drawer's Contacts
 * tab) and tests/smac.spec.ts (the Issue and Approve prompts, `t()` for every
 * visible string). Both locale projects run against ONE seeded database
 * (playwright.config.ts: `workers: 1`, one `globalSetup` reseed), so every
 * write this file makes is undone in a `finally` before the next project's
 * test starts reading the same rows.
 */

const COLD = { timeout: 30_000 };

/** The call bands section on /day, scoped by its own heading — never the whole page (call-list.tsx). */
function callsSection(page: Page, whoToCall: string): Locator {
  return page.locator("section").filter({ hasText: whoToCall });
}

type ContactedCompany = {
  id: string;
  name: string;
  next_follow_up: string | null;
  contact_name: string;
  phone: string;
};

/*
 * Two conditions in both helpers that are about D147 rather than about calling.
 *
 * `ct2.rep_id = c.rep_id` — a company two reps work has a main contact EACH
 * (`contacts_one_main_idx` is per rep), and the number the day card and the
 * customer row show is the reader's own. Faisal is the rep here, so his is the
 * one the screen will be carrying, and picking whichever row sorted first asked
 * the screen about somebody else's person.
 *
 * And the name must be its own on that record: two reps may hold the same buyer
 * and that is not a duplicate (§3), so a drawer can legitimately carry his name
 * twice — which is a real row for a person to read and an ambiguous locator for
 * a walk. This picks a contact there is only one of.
 */

/** Faisal's live companies, due today or overdue, with a main contact carrying a phone. */
async function dueWithContact(
  repId: string,
  today: string,
  minContacts = 1,
): Promise<ContactedCompany[]> {
  return query<ContactedCompany>(
    `select c.id, c.name, c.next_follow_up::text as next_follow_up,
            ct.name as contact_name, ct.phone_normalized as phone
       from companies c
       join contacts ct on ct.id = (
         select ct2.id from contacts ct2
          where ct2.company_id = c.id and ct2.archived_at is null
            and ct2.rep_id = c.rep_id
          order by ct2.is_main desc, ct2.created_at asc
          limit 1
       )
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and c.next_follow_up is not null
        and c.next_follow_up <= $2::date
        and ct.phone_normalized is not null
        and not exists (
          select 1 from contacts x
           where x.company_id = c.id and x.archived_at is null
             and x.id <> ct.id and x.name = ct.name
        )
        and (
          select count(*) from contacts n
           where n.company_id = c.id and n.archived_at is null
        ) >= $3::int
      order by c.next_follow_up asc
      limit 1`,
    [repId, today, minContacts],
  );
}

/** Any of Faisal's live companies that has a main contact with a phone, due or not. */
async function anyWithContact(repId: string, minContacts = 1): Promise<ContactedCompany> {
  return one<ContactedCompany>(
    `select c.id, c.name, c.next_follow_up::text as next_follow_up,
            ct.name as contact_name, ct.phone_normalized as phone
       from companies c
       join contacts ct on ct.id = (
         select ct2.id from contacts ct2
          where ct2.company_id = c.id and ct2.archived_at is null
            and ct2.rep_id = c.rep_id
          order by ct2.is_main desc, ct2.created_at asc
          limit 1
       )
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and ct.phone_normalized is not null
        and not exists (
          select 1 from contacts x
           where x.company_id = c.id and x.archived_at is null
             and x.id <> ct.id and x.name = ct.name
        )
        and (
          select count(*) from contacts n
           where n.company_id = c.id and n.archived_at is null
        ) >= $2::int
      order by c.name
      limit 1`,
    [repId, minContacts],
  );
}

test("a number on the day's calls is a message and a call", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const today = todayRiyadh();

  const found = await dueWithContact(faisal, today);
  let wroteFollowUp = false;
  const company = found[0] ?? (await anyWithContact(faisal));
  if (!found[0]) {
    wroteFollowUp = true;
    await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
      company.id,
      today,
    ]);
  }

  const phone = storedE164(company.phone);
  const contactName = company.contact_name;

  try {
    await test.step("Faisal's day: the card carries a WhatsApp link and a call link", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/day`);
      await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

      const section = callsSection(page, t("day.whoToCall"));
      const card = section.getByRole("listitem").filter({ hasText: company.name });
      await expect(card).toBeVisible();

      const whatsapp = card.getByRole("link", {
        name: t("companies.whatsappContact", { name: contactName }),
      });
      await expect(whatsapp).toHaveAttribute("href", whatsappHref(phone));
      await expect(whatsapp).toContainText(formatPhone(phone));

      const call = card.getByRole("link", {
        name: t("companies.callContact", { name: contactName }),
      });
      await expect(call).toHaveAttribute("href", telHref(phone));
    });

    await test.step("the same company's row on the customer list", async () => {
      await page.goto(`/${locale}/companies`);
      await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);

      const row = page.getByRole("row").filter({ hasText: company.name });
      const whatsapp = row.getByRole("link", {
        name: t("companies.whatsappContact", { name: contactName }),
      });
      await expect(whatsapp).toHaveAttribute("href", whatsappHref(phone));
      await expect(whatsapp).toContainText(formatPhone(phone));

      const call = row.getByRole("link", {
        name: t("companies.callContact", { name: contactName }),
      });
      await expect(call).toHaveAttribute("href", telHref(phone));
    });

    await test.step("the contact's own row in the drawer's Contacts tab", async () => {
      await page.goto(`/${locale}/companies?open=${company.id}`);
      const drawer = page.getByRole("dialog", { name: company.name });
      await expect(drawer).toBeVisible(COLD);
      await drawer.getByRole("tab", { name: t("common.contacts") }).click();

      const contactRow = drawer.getByRole("listitem").filter({ hasText: contactName });
      const whatsapp = contactRow.getByRole("link", {
        name: t("companies.whatsappContact", { name: contactName }),
      });
      await expect(whatsapp).toHaveAttribute("href", whatsappHref(phone));
      await expect(whatsapp).toContainText(formatPhone(phone));

      const call = contactRow.getByRole("link", {
        name: t("companies.callContact", { name: contactName }),
      });
      await expect(call).toHaveAttribute("href", telHref(phone));
    });
  } finally {
    if (wroteFollowUp) {
      await query(`update companies set next_follow_up = $2 where id = $1::uuid`, [
        company.id,
        company.next_follow_up,
      ]);
    }
  }
});

/**
 * "Tapping a phone anywhere opens WhatsApp via wa.me; long-press/secondary
 * shows the number" — the second half of it (SPEC §3, D165).
 *
 * The first half has been walked since P11A. The second was never bound to
 * anything, and what it is FOR is easy to miss here, because Kladra prints the
 * number as the link's own label rather than hiding it behind an icon: a tap on
 * a phone opens WhatsApp before a finger can select anything, so a rep reading
 * a number out to a colleague, or pasting it into another app, had no way to
 * take it off the screen. The browser's own menu would have offered him the
 * wa.me address.
 *
 * Both ways in are walked. `contextmenu` is the desktop's — the right button,
 * two fingers on a trackpad, and the keyboard's own menu key, which is why it
 * is bound to that event and not to a mouse button. The hold is the phone's,
 * and it is dispatched by hand because this suite runs one desktop browser: a
 * pointerdown that says it came from a finger, and no pointerup for as long as
 * the press is meant to last.
 */
test("a held number shows itself, and offers to be copied", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await anyWithContact(faisal);
  const phone = storedE164(company.phone);
  const readable = formatPhone(phone);

  // Two permissions, not one: writing is what the page does, reading is what
  // this spec does to check it. Chromium refuses either to a page that was never
  // granted it, and the app catches its refusal and shows it as a failure —
  // which is the right behaviour and the wrong thing to be testing here.
  await page.context().grantPermissions(["clipboard-write", "clipboard-read"]);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);

  const row = page.getByRole("row").filter({ hasText: company.name });
  const whatsapp = row.getByRole("link", {
    name: t("companies.whatsappContact", { name: company.contact_name }),
  });
  await expect(whatsapp).toHaveAttribute("href", whatsappHref(phone), COLD);

  await test.step("a secondary press shows the number instead of the browser's menu", async () => {
    await whatsapp.click({ button: "right" });

    const panel = page.getByRole("dialog", {
      name: t("companies.numberOf", { name: company.contact_name }),
    });
    await expect(panel).toBeVisible(COLD);
    // The number itself, not the address the link carries.
    await expect(panel).toContainText(readable);

    await panel.getByRole("button", { name: t("common.copyNumber") }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByText(t("common.numberCopied"), { exact: true })).toBeVisible(COLD);

    // What was taken is what was on the screen, not the wa.me address and not
    // the stored form nobody was shown.
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(readable);
  });

  await test.step("and a long press does the same on a phone", async () => {
    await page.keyboard.press("Escape");
    const box = await whatsapp.boundingBox();
    expect(box, "the number has no box to be pressed").not.toBeNull();

    await whatsapp.dispatchEvent("pointerdown", {
      bubbles: true,
      pointerType: "touch",
      clientX: Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2),
      clientY: Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2),
    });

    // No pointerup: the press is still down, which is what a hold is.
    await expect(
      page.getByRole("dialog", {
        name: t("companies.numberOf", { name: company.contact_name }),
      }),
    ).toBeVisible(COLD);
  });
});

test("a card with nobody to call says so", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const today = todayRiyadh();

  const noLiveContact = await query<{ id: string; name: string }>(
    `select id, name from companies c
      where c.rep_id = $1::uuid and c.archived_at is null
        and not exists (
          select 1 from contacts ct where ct.company_id = c.id and ct.archived_at is null
        )
      order by c.name
      limit 1`,
    [faisal],
  );

  let company: { id: string; name: string };
  let archivedContactIds: string[] = [];

  if (noLiveContact[0]) {
    company = noLiveContact[0];
  } else {
    // None on file — make one: the company of Faisal's with the fewest live
    // contacts, all of them archived here and restored in `finally`.
    company = await one<{ id: string; name: string }>(
      `select c.id, c.name from companies c
        where c.rep_id = $1::uuid and c.archived_at is null
        order by (
          select count(*) from contacts ct where ct.company_id = c.id and ct.archived_at is null
        ) asc, c.name
        limit 1`,
      [faisal],
    );
    archivedContactIds = (
      await query<{ id: string }>(
        `select id from contacts where company_id = $1::uuid and archived_at is null`,
        [company.id],
      )
    ).map((row) => row.id);
    if (archivedContactIds.length > 0) {
      await query(
        `update contacts set archived_at = now() where company_id = $1::uuid and archived_at is null`,
        [company.id],
      );
    }
  }

  const before = await one<{ next_follow_up: string | null }>(
    `select next_follow_up::text as next_follow_up from companies where id = $1::uuid`,
    [company.id],
  );
  const wroteFollowUp = !(before.next_follow_up !== null && before.next_follow_up <= today);
  if (wroteFollowUp) {
    await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
      company.id,
      today,
    ]);
  }

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

    const section = callsSection(page, t("day.whoToCall"));
    const card = section.getByRole("listitem").filter({ hasText: company.name });
    await expect(card).toBeVisible();
    await expect(card.getByText(t("companies.noContact"))).toBeVisible();
    await expect(card.locator('a[href^="tel:"]')).toHaveCount(0);
  } finally {
    if (wroteFollowUp) {
      await query(`update companies set next_follow_up = $2 where id = $1::uuid`, [
        company.id,
        before.next_follow_up,
      ]);
    }
    if (archivedContactIds.length > 0) {
      await query(`update contacts set archived_at = null where id = any($1::uuid[])`, [
        archivedContactIds,
      ]);
    }
  }
});

function quotationLabel(number: number, revision: number): string {
  return revision > 1 ? `Q-${number}/${revision}` : `Q-${number}`;
}

test("the number prompts name the customer", async ({ page, locale, t }) => {
  const quotation = await one<{ id: string; number: number; revision: number; company_name: string }>(
    `select q.id, q.number, q.revision, c.name as company_name
       from quotations q
       join companies c on c.id = q.company_id
      where q.status = 'requested'
      order by q.created_at desc
      limit 1`,
  );
  const dispatch = await one<{ id: string; number: number; company_name: string }>(
    `select d.id, d.number, c.name as company_name
       from dispatches d
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = q.company_id
      where d.status = 'submitted'
      order by d.created_at desc
      limit 1`,
  );

  await login(page, locale, "rawan");

  await test.step("the Issue prompt, on a requested quotation", async () => {
    const label = quotationLabel(quotation.number, quotation.revision);
    await page.goto(`/${locale}/queue?open=${quotation.id}`);
    const sheet = page.getByRole("dialog", { name: label });
    await expect(sheet).toBeVisible(COLD);

    await sheet.getByRole("button", { name: t("quotations.issue") }).click();
    const ask = page.getByRole("dialog", { name: t("quotations.issueTitle", { label }) });
    await expect(ask.locator('[data-slot="dialog-context"]')).toHaveText(quotation.company_name);

    // Cancel — the number is never typed, so there is nothing to undo.
    await ask.getByRole("button", { name: t("common.cancel") }).click();
    await expect(ask).toBeHidden();
  });

  await test.step("the Approve prompt, on a submitted dispatch", async () => {
    const label = `D-${dispatch.number}`;
    await page.goto(`/${locale}/queue?dispatch=${dispatch.id}`);
    const sheet = page.getByRole("dialog", { name: label });
    await expect(sheet).toBeVisible(COLD);

    await sheet.getByRole("button", { name: t("dispatches.approve") }).click();
    const ask = page.getByRole("dialog", { name: t("dispatches.approveTitle", { label }) });
    await expect(ask.locator('[data-slot="dialog-context"]')).toHaveText(dispatch.company_name);

    await ask.getByRole("button", { name: t("common.cancel") }).click();
    await expect(ask).toBeHidden();
  });
});

test("the log from a call card starts on the contact the card names", async ({
  page,
  locale,
  t,
}) => {
  // The same fixture as the first test in this file: Faisal's due company with
  // a main contact who carries a phone. Found afresh rather than shared across
  // tests — each test gets its own page and its own undo.
  const faisal = await userId("faisal@technopanel.com.sa");
  const today = todayRiyadh();

  // Two people at least: the second step asserts the header opens on NOBODY,
  // and a company with exactly one contact opens on that one by design (D115).
  // A fixture that did not say so proved the opposite of what it claims the day
  // the row it happened to pick had one person on it.
  const found = await dueWithContact(faisal, today, 2);
  let wroteFollowUp = false;
  const company = found[0] ?? (await anyWithContact(faisal, 2));
  if (!found[0]) {
    wroteFollowUp = true;
    await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
      company.id,
      today,
    ]);
  }

  try {
    await test.step("the card's Log button (D101): the dialog opens on the contact it names", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/day`);
      await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

      const section = callsSection(page, t("day.whoToCall"));
      const card = section.getByRole("listitem").filter({ hasText: company.name });
      await expect(card).toBeVisible();

      await card.getByRole("button", { name: t("day.logFor", { name: company.name }) }).click();

      const dialog = page.getByRole("dialog", { name: t("drawer.logTitle") });
      await expect(dialog).toBeVisible();

      // A shadcn Select, not a native one (log-dialog.tsx): the trigger's own
      // value slot shows the picked contact's name, and the rep can still
      // change it — nothing here disables the field.
      const contactField = dialog.getByRole("combobox", { name: t("common.contact") });
      await expect(contactField.locator('[data-slot="select-value"]')).toHaveText(
        company.contact_name,
      );

      // Cancel — the entry is never typed, so there is nothing to undo.
      await dialog.getByRole("button", { name: t("common.cancel") }).click();
      await expect(dialog).toBeHidden();
    });

    await test.step("the drawer header's Log button (D101): it does not know whom to preselect", async () => {
      // The card knows whom it shows; the header, opened with no contact in
      // hand, offers exactly the same field with nothing picked.
      await page.goto(`/${locale}/companies?open=${company.id}`);
      const drawer = page.getByRole("dialog", { name: company.name });
      await expect(drawer).toBeVisible(COLD);

      await drawer
        .getByRole("group", { name: t("drawer.companyActions") })
        .getByRole("button", { name: t("common.log"), exact: true })
        .click();

      const dialog = page.getByRole("dialog", { name: t("drawer.logTitle") });
      await expect(dialog).toBeVisible();

      const contactField = dialog.getByRole("combobox", { name: t("common.contact") });
      await expect(contactField.locator('[data-slot="select-value"]')).toHaveText(
        t("drawer.noContact"),
      );

      await dialog.getByRole("button", { name: t("common.cancel") }).click();
      await expect(dialog).toBeHidden();
    });
  } finally {
    if (wroteFollowUp) {
      await query(`update companies set next_follow_up = $2 where id = $1::uuid`, [
        company.id,
        company.next_follow_up,
      ]);
    }
  }
});
