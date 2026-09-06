import { test, expect } from "@playwright/test";
import { csvCell } from "@/lib/csv";

/**
 * A CSV cell is text (SPEC D96). Pure: the export is a file the admin opens in
 * Excel, and a company name that opens with `=` is a formula Excel runs on his
 * machine. The rule is small enough to state in eight cells.
 */
test("a cell Excel would run is read as text, and a number is left a number", () => {
  expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
  expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
  expect(csvCell("+cmd|' /C calc'!A0")).toBe("\"'+cmd|' /C calc'!A0\"");
  expect(csvCell("-2+3")).toBe("\"'-2+3\"");
  expect(csvCell("\tstart")).toBe("\"'\tstart\"");
  // Every phone in the file, and any figure below nought.
  expect(csvCell("+966501234567")).toBe('"+966501234567"');
  expect(csvCell("-1500.50")).toBe('"-1500.50"');
  expect(csvCell(-3)).toBe('"-3"');
});

test("a quote is doubled, a comma and a newline stay inside the cell, nothing is nothing", () => {
  expect(csvCell('Al-Rajhi "Tower"')).toBe('"Al-Rajhi ""Tower"""');
  expect(csvCell("Riyadh, Olaya")).toBe('"Riyadh, Olaya"');
  expect(csvCell("two\nlines")).toBe('"two\nlines"');
  expect(csvCell(null)).toBe('""');
  expect(csvCell(undefined)).toBe('""');
});
