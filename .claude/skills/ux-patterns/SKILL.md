---
name: ux-patterns
description: The UX lens for building, reshaping or reviewing any Kladra screen in G6 (S12.0–S12.10). Distilled from designmotionhq's free pattern library (76 breakdowns and their videos), its free Design System Blueprint PDF, its public UX Engine framework, its YouTube shorts and the standards behind them (WCAG 2.2, NN/g, Material 3, Apple HIG), held against DESIGN.md. It records what confirms a Kladra rule, what adds a number Kladra lacked, and what is refused. Load it before judging a screen, writing an S12 brief, or building a list, form, drawer, dialog, board, toast, empty or loading state.
---

# ux-patterns — what the pattern library taught, in Kladra's terms

**Precedence.** The founder's words come first, then DESIGN.md and SPEC.md, then this skill.
When a pattern here disagrees with DESIGN, DESIGN wins. Every such case is listed in
`refused.md` with the reason, so no builder re-proposes it. This skill is a lens for checking
a screen. It does not set Kladra's rules: a rule enters DESIGN (§8) or SPEC §4 only when a
slice builds it.

**What was read.** The source is designmotionhq.com, a studio whose product is "UI that
doesn't look AI-made". The founder likes the look of its PDF but did not buy the paid plugin,
so only public material was used:
- all 76 free `/patterns/<slug>` pages, each read with a contact sheet of its video;
- the 11-page Blueprint PDF;
- the home and about pages, which describe the paid UX Engine's eight skills and four
  commands in public;
- the shorts on `@designmotionhq_yt` whose topics are not among the patterns;
- NN/g, WCAG 2.2, Material 3, Apple HIG, Atlassian, Vercel's guidelines and published Arabic
  typography practice, read for seven deeper topics: states, action hierarchy, visual
  character, boards without drag, target size, motion restraint, and dense bilingual screens.

Instagram and TikTok need a login and were not read. Every rule below is paraphrased, and
`sources.md` gives the URL for each one.

## Files

| File | Read it when |
|---|---|
| `lens.md` | You judge a screen, including S12.0, a critic pass or S12.10. It is the walk every state gets, plus the finding format. |
| `states-feedback.md` | A screen loads, is empty, fails, succeeds or goes offline, or you are choosing between a toast, a banner, a dialog, undo or a confirm. |
| `forms-input.md` | You build a dialog or form: labels, validation timing, busy vs disabled, phone masking, dropdowns, dates, long request dialogs, settings. |
| `lists-navigation.md` | You build a table, filter chips, search, the palette, tabs, the rail or bottom bar, an overlay choice, a menu or a board without drag. |
| `visual.md` | You check hierarchy, grouping, alignment, radius, elevation, contrast, icons, gradients, cards, charts, or what the PDF's look offers. |
| `motion.md` | You pick a duration, an easing, a tooltip delay, an accordion or an exit. |
| `standards.md` | You need the standard behind a rule: boards without drag (WCAG 2.5.7), target size (WCAG 2.5.8 and 2.5.5, thumb reach), motion restraint (M3 tokens, frequency, reduced motion), or dense bilingual screens (bidi, icons that mirror, chart axes, Arabic leading and weight). |
| `refused.md` | A pattern tempts you. Check here before proposing it. |
| `sources.md` | You need the URL, the priority or the one-line takeaway for a pattern. |
| `notes/` | You need the detail. `notes/patterns/<slug>.txt` holds one reading per pattern (rules, do/don't, what the video shows, where it lands in Kladra, priority). `notes/patterns/_index_A.txt` and `_index_B.txt` rank them. `notes/site/` holds the site's UI, the product framework, social channels, the deeper topics and the PDF text. |

## The five ideas that recur across the library

1. **A screen is a set of states, not a happy path.** Loading, empty, partial, error, success
   and offline each need drawing. Most apps draw two.
2. **Severity picks the surface.** The problem goes inline under a field, a toast goes at the
   edge, a banner goes across, and a dialog is used only when the person cannot go on.
   Escalating everything teaches people to ignore all of it.
3. **One focal point, one accent, one word per state.** Hierarchy comes from stacking size,
   weight, contrast, space and colour on one thing. Colour never carries meaning alone.
4. **Every dead end has an exit.** An error says what to do next. An empty list says why it
   is empty and how to get out. Something reversible gets undo rather than a question.
5. **Structure beats decoration, and the product must not read as a schema browser.** A
   table that mirrors the database, with Edit and Delete at equal weight on every row, looks
   clean and is still wrong. The public UX Engine page names this failure, and it is the one
   a CRUD CRM is most exposed to.
