import { test, expect } from "@playwright/test";
import { AVATAR_TINTS, avatarTint, initialsOf } from "@/lib/avatar";

/**
 * Who an avatar is (DESIGN §1b, P13-S1). Pure functions, asked directly.
 */

test("one record is one colour for as long as it exists, and eight colours are all used", () => {
  const id = "0f8b9c52-8a1e-4f0e-9d0b-6a3c1b2e7d45";
  expect(avatarTint(id)).toBe(avatarTint(id));
  const seen = new Set<number>();
  for (let i = 0; i < 400; i += 1) {
    const tint = avatarTint(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(tint).toBeGreaterThanOrEqual(1);
    expect(tint).toBeLessThanOrEqual(AVATAR_TINTS);
    seen.add(tint);
  }
  // Four hundred colleagues and customers, and no tint left out: a hash that
  // favoured three of eight would put half the team in one colour.
  expect(seen.size).toBe(AVATAR_TINTS);
});

test("the letters are the name's, in the script it is written in", () => {
  // Latin: first and last, the family's "Al-" set aside.
  expect(initialsOf("Faisal Al-Harbi")).toBe("FH");
  expect(initialsOf("Abdulrahman Al-Zahrani")).toBe("AZ");
  expect(initialsOf("Delta Rock Co")).toBe("DC");
  expect(initialsOf("Technopanel")).toBe("T");
  expect(initialsOf("  rawan   ")).toBe("R");
  // Arabic: one letter, the article and the kind of business set aside.
  expect(initialsOf("فيصل الحربي")).toBe("ف");
  expect(initialsOf("شركة الرواسي للمقاولات العامة")).toBe("ر");
  expect(initialsOf("مصنع سدرة للصناعات المعدنية")).toBe("س");
  expect(initialsOf("الرواد")).toBe("ر");
  // Nothing to draw is nothing, not a crash.
  expect(initialsOf("")).toBe("");
  expect(initialsOf("—")).toBe("");
});
