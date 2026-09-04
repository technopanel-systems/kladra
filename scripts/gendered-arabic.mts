/**
 * Arabic that addresses nobody's gender.
 *
 * Rawan is the sales coordinator and Kladra is her tool as much as Faisal's.
 * Arabic marks the person it speaks to: `اكتب` is "write" said to a man, and a
 * screen full of those tells half the office it was not written for them. It is
 * not a translation error — every one of these strings is correct Arabic — which
 * is exactly why nobody catches it by reading.
 *
 * The way out is the one Arabic software has used for years: say the action, do
 * not order it. `اكتب السبب` becomes `السبب مطلوب`; `اختر تاريخًا` becomes
 * `اختيار التاريخ`; where an instruction is unavoidable, `الرجاء` plus the
 * verbal noun. The result reads as an office notice rather than as an order,
 * which is also the register a Riyadh office writes in.
 *
 * This lists the forms that carry the marking. It is deliberately a list of
 * words and not a grammar: a checker nobody can predict is a checker people
 * work around. Passive verbs are spelled the same without their vowels — `سُجّل`
 * is "was logged" and `سجّل` is "log it!" — so a word carrying a damma is read
 * as passive and left alone, which is why the passives in messages/ar keep
 * theirs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Imperatives only, and only the ones that cannot be read as anything else.
 *
 * `تتعامل` is "you deal with" said to a man AND "she deals with" — one spelling,
 * two readings — so a checker that flagged it would fire on `الشركة تتعامل` and
 * be switched off within a week (DESIGN §5: a check that cries wolf is a check
 * nobody reads). The imperfect forms are caught by reading. `سجل` is left out
 * for the same reason: unvocalised it is the noun "record", which this app says
 * often; the verb is written `سجّل` and that is what is listed.
 */
const ADDRESSED_TO_A_MAN = [
  "اختر",
  "اكتب",
  "أضف",
  "سجّل",
  "جرب",
  "جرّب",
  "حاول",
  "ابحث",
  "ابدأ",
  "اطلب",
  "أنشئ",
  "حدد",
  "حدّد",
  "افتح",
  "أغلق",
  "استخدم",
  "اجعل",
  "اجعلها",
  "اجعله",
  "راجع",
  "أعد",
  "أعدها",
  "أعده",
  "اضغط",
  "انقر",
  "قم",
  "تأكد",
];

const DAMMA = "ُ";
/**
 * The vowel marks, but NOT the shadda: the shadda is what tells `سجّل` ("log
 * it!") from `سجل` ("a record"), which are otherwise the same three letters.
 */
const HARAKAT = /[ً-ِْٰـ]/g;

/** A word, by Arabic's own idea of one: letters and the marks that sit on them. */
const WORD = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g;

const forbidden = new Set(ADDRESSED_TO_A_MAN.map((word) => word.replace(HARAKAT, "")));

type Finding = { file: string; key: string; word: string; text: string };

function walk(node: unknown, path: string[], onString: (key: string, text: string) => void): void {
  if (typeof node === "string") return onString(path.join("."), node);
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) walk(value, [...path, key], onString);
}

const dir = join(process.cwd(), "messages", "ar");
const findings: Finding[] = [];

for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
  const messages: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
  walk(messages, [], (key, text) => {
    for (const word of text.match(WORD) ?? []) {
      // A damma on a verb is what makes it passive — "was logged", not "log it".
      if (word.includes(DAMMA)) continue;
      const bare = word.replace(HARAKAT, "");
      if (forbidden.has(bare)) findings.push({ file, key, word, text });
    }
  });
}

if (findings.length === 0) {
  console.log("gendered-arabic — every Arabic string addresses nobody's gender");
  process.exit(0);
}

console.error(`gendered-arabic — ${findings.length} string(s) speak to a man:`);
for (const finding of findings) {
  console.error(`  ${finding.file} ${finding.key}: "${finding.word}" in ${finding.text}`);
}
console.error(
  "\nSay the action instead of ordering it — the verbal noun, or الرجاء + the verbal noun.",
);
process.exit(1);
