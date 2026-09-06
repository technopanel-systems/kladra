import { test, expect } from "@playwright/test";
import { normalizePhone } from "@/lib/phone";

/**
 * A phone is read in its company's country (SPEC D89).
 *
 * Pure, like tests/waiting.spec.ts: the rule is arithmetic on a string and a
 * country code, and every caller passes the country it has in scope. The walk
 * that adds a Dubai company through the form is in tests/rep.spec.ts.
 */

test("a Saudi number reads as it always did", () => {
  expect(normalizePhone("050 123 4567")).toBe("+966501234567");
  expect(normalizePhone("0501234567", "SA")).toBe("+966501234567");
  expect(normalizePhone("501234567", "SA")).toBe("+966501234567");
  expect(normalizePhone("966501234567", "SA")).toBe("+966501234567");
  expect(normalizePhone("+966 50 123 4567", "SA")).toBe("+966501234567");
  expect(normalizePhone("00966501234567", "SA")).toBe("+966501234567");
});

test("the same digits on a Dubai card are a UAE number", () => {
  expect(normalizePhone("050 123 4567", "AE")).toBe("+971501234567");
  expect(normalizePhone("501234567", "AE")).toBe("+971501234567");
  expect(normalizePhone("971501234567", "AE")).toBe("+971501234567");
  expect(normalizePhone("010 0123 4567", "EG")).toBe("+201001234567");
  expect(normalizePhone("079 123 4567", "JO")).toBe("+962791234567");
});

test("a number typed with its own country code is read as such wherever the card is", () => {
  expect(normalizePhone("971501234567", "SA")).toBe("+971501234567");
  expect(normalizePhone("+971501234567", "SA")).toBe("+971501234567");
  expect(normalizePhone("966501234567", "AE")).toBe("+966501234567");
});

test("a plus wins over the country, and 00 is a plus", () => {
  expect(normalizePhone("+44 20 7946 0958", "SA")).toBe("+442079460958");
  expect(normalizePhone("0044 20 7946 0958", "AE")).toBe("+442079460958");
});

test("what cannot be read is refused rather than guessed", () => {
  // The old fallback made any eight digits an "international" number.
  expect(normalizePhone("12345678", "SA")).toBeNull();
  expect(normalizePhone("05012345", "SA")).toBeNull();
  // A country the table does not know: only with its code.
  expect(normalizePhone("0501234567", "ZZ")).toBeNull();
  expect(normalizePhone("+299 12 34 56", "ZZ")).toBe("+299123456");
  expect(normalizePhone("", "SA")).toBeNull();
  expect(normalizePhone("abc", "AE")).toBeNull();
});
