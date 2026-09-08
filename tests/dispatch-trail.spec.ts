import { login } from "./helpers/auth";
import { one, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { dispatchLabel } from "@/lib/labels";

/**
 * P11J — a dispatch says what happened to it (D143).
 *
 * The quotation drawer has carried its trail since P9: requested, sent back
 * with her words, edited, issued, answered. The dispatch drawer carried the day
 * it was raised and the day it was approved, and everything between — the
 * quantities edited, the refusal and its reason, the SMAC number corrected —
 * lived in the audit log with nothing reading it back. The rows were being
 * written the whole time.
 */

const COLD = { timeout: 30_000 };

test("the refused dispatch says who refused it, when, and in whose words", async ({
  page,
  locale,
  t,
}) => {
  const refused = await one<{
    id: string;
    number: number;
    reason: string;
    name: string;
    nameAr: string | null;
  }>(
    `select d.id, d.number, d.refuse_reason as reason, u.name, u.name_ar as "nameAr"
       from dispatches d
       join audit_log a on a.record_type = 'dispatch'
                       and a.record_id = d.id::text
                       and a.action = 'dispatch.refuse'
       join users u on u.id = a.user_id
      where d.status = 'refused'
      order by d.created_at, d.number
      limit 1`,
  );
  const who = locale === "ar" && refused.nameAr ? refused.nameAr : refused.name;

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/dispatches?open=${refused.id}`);

  const drawer = page.getByRole("dialog", { name: dispatchLabel(refused.number) });
  await expect(drawer).toBeVisible(COLD);

  const trail = drawer.locator("li[data-event]");
  await expect(trail.first(), "the dispatch drawer has no trail").toBeVisible(COLD);
  // Oldest first: it was asked for before it was refused.
  await expect(trail.first()).toHaveAttribute("data-event", "request");

  const refusal = drawer.locator("li[data-event='refuse']");
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toContainText(t("dispatches.event.refuse"));
  await expect(refusal, "the refusal does not say whose words these are").toContainText(
    t("common.by", { name: who }),
  );
  await expect(refusal, "her reason is not on the trail").toContainText(refused.reason);
});

test("an approved one carries its approval, and the rep reads the same trail", async ({
  page,
  locale,
  t,
}) => {
  // HIS: a rep may not open a dispatch on somebody else's company (S8), and
  // `getDispatch` refuses it by returning nothing at all, so a pick that does
  // not name the rep is a test that reports an empty drawer as a broken one.
  // Ordered on the number as well as the day because the seed's history months
  // give two dispatches the same instant, and `limit 1` over a tie has no
  // winner. Newest first, which is this month's — the one an approval date can
  // still be wrong about.
  const faisal = await userId("faisal@technopanel.com.sa");
  const approved = await one<{ id: string; number: number }>(
    `select d.id, d.number
       from dispatches d
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = q.company_id
      where d.status = 'approved' and c.rep_id = $1::uuid
      order by d.created_at desc, d.number desc
      limit 1`,
    [faisal],
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/dispatches?open=${approved.id}`);

  const drawer = page.getByRole("dialog", { name: dispatchLabel(approved.number) });
  await expect(drawer).toBeVisible(COLD);

  // The heading exists once, and the two ends of the chain are both on it. The
  // rep reads the coordinator's work on his own screen (S8): a trail is what
  // the record says, not something to press (D42).
  await expect(drawer.getByText(t("dispatches.history"), { exact: true })).toBeVisible(COLD);
  await expect(drawer.locator("li[data-event='request']")).toHaveCount(1);
  await expect(drawer.locator("li[data-event='approve']")).toHaveCount(1);
  // Asked for, THEN approved. The demo had two dispatches whose approval day
  // was a fixed day of the month and whose raising day was counted in working
  // days, and the two clocks crossed over: nothing read them in order until
  // this trail did, and it read "Approved" over "Requested" (P11J).
  await expect(drawer.locator("li[data-event]").first()).toHaveAttribute("data-event", "request");
});
