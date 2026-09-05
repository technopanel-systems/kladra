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

**And that is not only a words rule.** `FollowUpFilter` gained `"quiet"`;
`FILTERS`, the runtime list `parseFollowUpFilter` tests a URL against, did not.
Both copies were legal TypeScript, so `?filter=quiet` parsed to undefined, the
filter was dropped, and the customer list opened WHOLE under a heading that said
these were the quiet ones — a screen lying about what it is showing, from one
word missing in a second list. **The list is the source and the union is derived
from it**: `const FILTERS = [...] as const;` then
`type FollowUpFilter = (typeof FILTERS)[number];`, so adding a member to the
list is the only way there is to add one. `ROLES` in `src/lib/types.ts` is the
same shape, and the pgEnum in the schema and the picker in the admin panel read
it rather than repeat it.

## A key a SPEC names is a key
The specs read the same message files the app does — that is what makes them
worth running — so a name they use has to exist. `day.quietMeans` moved into
`common`, three specs kept asking for the old name, and every one of them passed
its own assertions and then threw MISSING_MESSAGE inside `t()`, ten minutes into
a suite that had already rebuilt the database. `check-messages` reads every
literal `t("a.b")` in `tests/*.spec.ts` now and fails in two seconds instead.

## A person is named in the reader's script
`users.name` is the Latin name and `users.name_ar` the Arabic one, and a query
that selects the first straight onto a screen puts "Faisal Al-Harbi" under a
heading that says المندوب (D68). One helper resolves it — `personName(locale)`,
`personNameOf(alias, locale)` and `personNameFrom(row, locale)` in
`src/lib/people.ts` — and `npm run lint` fails on anything else, with a short
allowlist naming the files that may use the Latin name and the reason each may:
the CSV export, the audit log, the admin's own list, the session, the schema.
A new query that forgets is caught by the check, not by an Arabic screen.

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

## Two figures with almost the same name are one figure with a bug
"Follow-ups overdue" (more than three days past) sat two inches above "Overdue
follow-ups" (any day past) on the manager's own screen, and both were correct.
A reader cannot tell them apart and neither can the person who adds the third
one. **A figure with a threshold in it says the threshold**, in the caption slot
`StandingStrip` has for exactly this (D59, D60) — and if two figures still read
alike after that, one of them is named wrong.

The corollary, from the same audit: a word may mean one thing. "Quoted" was
sheets on a dispatch line and square metres on a project, in English only —
the Arabic had said في عرض السعر against المعروض all along. When one locale
distinguishes two things and the other does not, the one that does is right.

## A family is a nested OBJECT, and its parent cannot also be a string
next-intl refuses a flat key with a dot in it — `"chain.waiting"` throws
INVALID_KEY at render, not at build — so a family of keys is a nested object,
the way `projects.lossReason` and `admin.lookup` already are. And the parent
name is then taken: `team.chain` cannot be both the heading and the family, so
the heading is `team.chainTitle`.

Two things follow for the checks. Write the call site as the FULL path —
`` t(`team.chain.${stage}`) `` under a root `getTranslations()`, not
`` t(`chain.${stage}`) `` under a namespaced one — or `unused-messages` cannot
see the prefix and reports every member as dead. And register the family in
`check-messages.ts` so a new member without a word fails the build.

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
