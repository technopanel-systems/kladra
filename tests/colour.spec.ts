import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";
import {
  TONE_CLASS,
  TONE_TEXT,
  dispatchTone,
  followUpClass,
  followUpTone,
  paceTone,
  quotationTone,
  type StateTone,
} from "@/lib/state-tone";

/**
 * Colour means one thing, and means it everywhere (DESIGN §6).
 *
 * Jerom's P8 note was that colour should carry state, overdue, stuck and ahead
 * of target. The risk in answering that is the opposite of the old problem: not
 * too little colour but too much, and five screens each deciding for themselves
 * what amber means. So the mapping is one table in `src/lib/state-tone.ts`, and
 * this asks it directly and then checks the screens agree with it.
 */

const TONES: StateTone[] = ["wait", "open", "good", "bad", "over"];

test("every tone has a tint and a text colour, and no two share one", () => {
  for (const tone of TONES) {
    expect(TONE_CLASS[tone], `${tone} has no tint`).toContain(`bg-state-${tone}`);
    expect(TONE_TEXT[tone], `${tone} has no text colour`).toBe(`text-state-${tone}-fg`);
  }
  expect(new Set(TONES.map((tone) => TONE_CLASS[tone])).size).toBe(TONES.length);
});

test("a status has exactly one tone, and the two chains agree about waiting", () => {
  expect(quotationTone("requested")).toBe("wait");
  expect(quotationTone("returned")).toBe("wait");
  expect(quotationTone("issued")).toBe("open");
  expect(quotationTone("accepted")).toBe("good");
  expect(quotationTone("rejected")).toBe("bad");
  // Withdrawn is not a failure: nothing happened (D32).
  expect(quotationTone("cancelled")).toBe("over");

  // A request waiting on the coordinator is the same fact in either chain.
  expect(dispatchTone("submitted")).toBe(quotationTone("requested"));
  expect(dispatchTone("approved")).toBe("good");
  expect(dispatchTone("refused")).toBe("bad");
});

test("due today is not overdue, and a date in the future is nobody's problem", () => {
  expect(followUpTone("overdue")).toBe("bad");
  // S50: due today is due, not late.
  expect(followUpTone("today")).toBe("wait");
  expect(followUpTone("future")).toBeNull();
  expect(followUpTone(null)).toBeNull();

  expect(followUpClass("2026-09-01", "2026-09-05")).toBe(TONE_TEXT.bad);
  expect(followUpClass("2026-09-05", "2026-09-05")).toBe(TONE_TEXT.wait);
  expect(followUpClass("2026-09-30", "2026-09-05")).toBe("text-faint");
  expect(followUpClass(null, "2026-09-05")).toBe("text-faint");
});

test("a month behind by a little is not the same as a month behind", () => {
  // No target is not a zero target (D41): it has no tone at all.
  expect(paceTone(0, 0, 0.5)).toBeNull();
  // Level with the calendar, or ahead of it.
  expect(paceTone(500, 1000, 0.5)).toBe("good");
  expect(paceTone(900, 1000, 0.5)).toBe("good");
  // Short by four points on the eighth of the month is not a red screen.
  expect(paceTone(460, 1000, 0.5)).toBe("wait");
  // Short by half a month is.
  expect(paceTone(100, 1000, 0.5)).toBe("bad");
});

/** What the filter says the rows are, and what colour they should therefore be. */
const QUOTATION_FILTERS = [
  { status: "requested", tone: "wait" },
  { status: "issued", tone: "open" },
  { status: "accepted", tone: "good" },
  { status: "rejected", tone: "bad" },
] as const;

test("the quotations list paints each status the tone the table gives it", async ({
  page,
  locale,
}) => {
  await login(page, locale, "rawan");

  for (const { status, tone } of QUOTATION_FILTERS) {
    await page.goto(`/${locale}/quotations?status=${status}`);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });

    const tones = await page.locator("[data-tone]").evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => node.getAttribute("data-tone")),
    );
    // An empty filter proves nothing, and is not a failure — the seed moves.
    for (const seen of tones) expect(seen, `on ?status=${status}`).toBe(tone);
  }
});

test("a dispatch waiting on the coordinator looks like a quotation waiting on her", async ({
  page,
  locale,
}) => {
  await login(page, locale, "rawan");

  await page.goto(`/${locale}/dispatches?status=submitted`);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
  const waiting = await page.locator("[data-tone]").evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLElement).offsetParent !== null)
      .map((node) => node.getAttribute("data-tone")),
  );
  for (const seen of waiting) expect(seen).toBe("wait");

  await page.goto(`/${locale}/dispatches?status=approved`);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
  const done = await page.locator("[data-tone]").evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLElement).offsetParent !== null)
      .map((node) => node.getAttribute("data-tone")),
  );
  for (const seen of done) expect(seen).toBe("good");
});
