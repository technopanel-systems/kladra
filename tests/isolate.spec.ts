import { test, expect } from "@playwright/test";
import { isolatePlaceholders } from "@/i18n/isolate";
import { loadMessages, type Locale } from "./helpers/i18n";

/**
 * The two invisible characters every message gets around every value it is
 * handed (src/i18n/isolate.ts), and the promise that they are the ONLY thing
 * the loader changes.
 *
 * The second spec in this suite that walks no screen, and for the same reason
 * the first one earns it: nothing here has an appearance until a customer is
 * called "3M Arabia" and a sentence about him comes out with its full stop in
 * the wrong place. The rule is checked where it lives instead of hoping a seed
 * happens to contain a hostile name.
 */

const FSI = "⁨";
const PDI = "⁩";

test("a value dropped into a sentence is isolated from it", () => {
  expect(isolatePlaceholders("Requested {label}.")).toBe(`Requested ${FSI}{label}${PDI}.`);
  expect(isolatePlaceholders("{rep} asked for {label}: {reason}")).toBe(
    `${FSI}{rep}${PDI} asked for ${FSI}{label}${PDI}: ${FSI}{reason}${PDI}`,
  );
  // Nothing to isolate, nothing touched — the message comes back identical.
  expect(isolatePlaceholders("Companies")).toBe("Companies");
});

test("a plural keeps its shape, and what is inside it is still isolated", () => {
  // The trap this was written against: `one {day}` LOOKS exactly like a simple
  // argument. It is a sub-message, and wrapping it would put two invisible
  // characters inside the plural's branch instead of around a value.
  const plural = "{count, plural, one {# day} other {# days}}";
  expect(isolatePlaceholders(plural)).toBe(plural);
  expect(isolatePlaceholders("{count, plural, one {day} other {days}}")).toBe(
    "{count, plural, one {day} other {days}}",
  );
  expect(isolatePlaceholders("{count, plural, other {# from {name}}}")).toBe(
    `{count, plural, other {# from ${FSI}{name}${PDI}}}`,
  );
  // A formatted argument is not a value we can isolate around — it has its own
  // syntax after the comma, and the isolate would land inside it.
  expect(isolatePlaceholders("{when, date, short}")).toBe("{when, date, short}");
});

test("quoted braces are text, not arguments, and running twice changes nothing", () => {
  expect(isolatePlaceholders("Use '{name}' as written")).toBe("Use '{name}' as written");
  const once = isolatePlaceholders("Saved {name}.");
  expect(isolatePlaceholders(once)).toBe(once);
});

/** Every string the app ships, both locales, through the transform. */
function everyMessage(locale: Locale): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === "string") return void out.push({ key: path, text: node });
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(loadMessages(locale), "");
  return out;
}

test("the loader adds isolates to the shipped messages and nothing else", () => {
  for (const locale of ["en", "ar"] as Locale[]) {
    const messages = everyMessage(locale);
    expect(messages.length, `${locale} loaded nothing`).toBeGreaterThan(400);

    for (const { key, text } of messages) {
      // Only ever inserted, never rearranged: strip the two characters and the
      // message is byte-for-byte what the JSON file holds.
      const stripped = text.replaceAll(FSI, "").replaceAll(PDI, "");
      expect(isolatePlaceholders(stripped), `${locale} ${key} was rewritten`).toBe(text);

      // And the rule reached all of them: no simple placeholder is left bare.
      const bare = [...stripped.matchAll(/\{\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\}/g)];
      for (const match of bare) {
        const at = text.indexOf(match[0]);
        // A sub-message like `one {day}` has no isolate and should have none.
        const inPlural = /,\s*(plural|select|selectordinal)\s*,/.test(stripped);
        if (inPlural) continue;
        expect(text[at - 1], `${locale} ${key} leaves ${match[0]} bare`).toBe(FSI);
      }
    }
  }
});
