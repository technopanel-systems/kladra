---
paths:
  - "messages/**"
  - "src/i18n/**"
  - "src/components/**"
---

# Words rules — two locales, one screen

**For:** anything that puts a string in front of a person.
**Prevents:** the class where the English is right, the Arabic is present, and
the screen is still wrong.

## Both locales ship together
A key in `messages/en/` and not in `messages/ar/` fails the build
(`npm run check:messages`). Three checks run: every key exists in both, every
key is rendered somewhere, and no Arabic string addresses a gender. Rawan reads
the same sentences Faisal does.

## A value dropped into a sentence is isolated — already, everywhere
`src/i18n/isolate.ts` wraps every simple `{placeholder}` in FSI/PDI as the
messages load, in both locales. **Do not add isolates by hand, and do not
"fix" a placeholder in a component.** Two rules follow from that:

- A message may use `{name}` freely, next to a full stop, a colon, a bracket
  or «guillemets», without thinking about direction.
- A **plural or select** branch is not a value. `{count, plural, one {day}}`
  looks exactly like an argument and must stay untouched; the loader knows the
  difference and `tests/isolate.spec.ts` holds it to that.

What a component still owns is the text it renders **itself**: a code, a phone,
a quantity, an email. Those get `<span dir="ltr" className="num">`, as they do
today in every table and drawer.

And one more thing a component owns: **two values joined by a separator in one
string**. `` `${company} · ${project}` `` is the same defect the loader fixes for
messages — the · is neutral and settles against the paragraph, not against the
name beside it. Render them as `<bdi>{company}</bdi> · <bdi>{project}</bdi>`.

## A key a screen COMPUTES is invisible to the parity check
`t(`common.${role}`)` is one call site and five keys. The both-locales check
compares en against ar, so a member missing from **both** — which is what a new
enum value always is — passes it, and the screen prints the key itself:
`common.marketing` appeared under everybody's name on every screen the day the
fifth role landed. `scripts/check-messages.ts` now reads each such union out of
the source file and demands a word for every member. **Add a family to that
list whenever a component renders a key from an enum**, and never write the
members out beside the union — a list beside a union is the second copy that
drifts.

## A block somebody TYPED runs in their direction, not the page's
Every other string on a screen came out of `messages/<locale>/` and runs the way
the page runs. A log entry, a coordinator's reason and a daily report did not:
they were typed by whoever typed them, and both languages are on every screen —
Saad writes English, Rawan writes Arabic, and each reads the other's on their own
page. **Render them through `<Prose>`** (`src/components/ui-ext/prose.tsx`),
which is a `<p dir="auto">`: the base direction comes from the first strong
character in the text itself.

`<bdi>` does not do this. It settles an inline RUN inside a sentence, which is
what the message loader uses it for, and leaves the BLOCK aligned to the page —
so an English paragraph in an Arabic card read left-to-right and sat flush right,
ragged down its left. Legible, and wrong.

## Digits are Western, everywhere (D6)
The locale tag is `"ar"`, never `"ar-SA"` — `ar-SA` gives Arabic-Indic
numerals and Jerom wants ٠٤ nowhere. When asking `Intl` for something
in Arabic, force it: `"ar-u-nu-latn"`. `tests/reading.spec.ts` measures this.

## Arabic reads day-first from the RIGHT
A date in an RTL line looks reversed to a reader scanning pixels
left-to-right. It is not. Measure with `document.createRange()` before
believing a screenshot — four reviews have called this a defect and all four
were wrong.

## A `--` comment inside a SQL template is still template source
A backtick in it closes the `` sql`` `` template and the whole file stops
parsing. Same trap in any tagged template. Run `npx tsc --noEmit` after
editing one, before running anything else.

## Say it in the app's words
SPEC §5 is the glossary and it wins over a literal translation:
عرض السعر never اقتباس, التوريد for a dispatch, سحب الطلب for a withdrawal and never
إلغاء. One figure has one name on every screen that shows it.
