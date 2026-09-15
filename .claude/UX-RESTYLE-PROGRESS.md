# UX restyle — progress (founder brief, 2026-09-14)

Lives under `.claude/` because hook H2 refuses a new .md anywhere else in the repo.
Part of P13-G6: the restyle is the design-system half of the front-end reshape.

## Current phase
Restyle phases P0–P4 done and committed; final gate green; `main` pushed (founder, 2026-09-15, overruling the Stage 3 hold).
Founder's 2026-09-15 order: (1) the request dialogs' line editor rebuilt as items — built, shot-looked, Arabic-reviewed,
targeted specs running; (2) every demo person has an Arabic name — done (seed + dev DB; reading.spec makes the fallback
for one screen); (3) S12.10 — full manifest shoot `shots/s1210` running; (4) leftover worktree folder — deleted;
(5) full suite, tick S12.10, commit, push, /cost, "switch to Fable and /audit".

## Checkpoints (git)
- 0d69156 — P4 consistency (state dot+word unboxed, avatar dot outer corner, neutral lead cards, one TableHead, strip figures 16px); final gate green.
- 602dc06 — P4 kit pass (36px fields drawn alike, 16px dialog titles, stale project drawer, report toast names company, own report flashes, إ initial).
- 3db54fd — wave 3 (S12.4 quotations, S12.5 dispatches, S12.6+7 day/queue/team) + SPEC D195–D204; suite 814 passed then services width spec fixed.
- d8699e0 — DESIGN §8 records the rules audit.
- ee9af5b P2 — shared components restyled; full suite 799/800 then the chip-row spec fixed (Arabic lookups now fit at 1366).
- 56bd6c1 P1 — Stone tokens + Plex Sans / Noto Sans Arabic + scale; DESIGN §1; WORKFLOW §3 #7 wording.
- 9b1778e — wave-2 gate green (drawer skeletons close).
- 9c2f76a — wave 2 merged (S12.2 companies, S12.3 projects, S12.8 reports/leads/duplicates) + kit pass (Clip, RowMenu end list/head size, common.moreFor). Last pre-restyle commit.

## What the 13 videos taught (applied, not copied)
- One accent, everything else grey; status by a small mark + word, not saturated pills. Accent calmer in dark.
- Near-black, not black; raise with lightness; 1px alpha hairlines instead of shadows; shadow only on what floats (menus, dialogs, toasts).
- Three text tiers (primary / muted / faint), never pure white.
- No gradient with nothing to say; no coloured icon tiles; one primary figure, the rest secondary; deltas as plain words.
- Tables: text left, numbers right in tabular figures; sentence-case muted headers; no stripes, one hairline + hover; 40px desk rows; sticky header; dash for missing; truncate names, never numbers; row actions revealed on hover, kept on touch.
- Phone lists: identity · value · state, two lines, amount in one right slot, dates labelled.
- Toasts: bottom corner on desk, always closable, errors hold until closed.
- Loading: skeleton for a known shape, busy label in the button, progress only when measurable.
- Empty: a quiet mark, one sentence, the way out. Charts: zero baseline, one highlighted series, grey context.
- Discarded: golden-ratio spacing (4px grid stays), spring/overshoot motion, mobile-top toasts (bottom lifted over the bar already reasoned in S12.1), neon glows.

## Design decisions (P1)
- Type: IBM Plex Sans (Latin) + Noto Sans Arabic (Plex Arabic refused: drawn a size small), one stack; figures in the sans, tabular numerals; no mono but keyboard hints. The stack NAMES the faces before next/font's variables: each variable carries an Arial fallback face with no unicode-range that captured Arabic, and Turbopack ignores adjustFontFallback:false.
- Scale: 2xs 11 · xs 12 · sm 13.5 · base 14.5 · lg 16 · xl 20 · 2xl 24; weights 400 / 500 / 600 only.
- Neutrals (oklch hue 70, chroma ≤ 0.01): light canvas #f7f5f3, surface #fefdfc, surface-2 #f0edea, rail #f2f0ed, text #211d1a, muted #605b56, faint #706b66. Dark canvas #12100e, surface #191714, surface-2 #23201d, raised #292623, rail #0e0c0a, text #ece9e5, muted #ada8a3, faint #8f8a85.
- Brand: flat, no gradient, no glow. Light #b33333 (hover #a0292a), dark #b95651; white ink passes 4.5:1 on both.
- States (text): light red #b33832 amber #90601f green #337344 blue #39659b; dark red #e88f85 amber #e0b67b green #8ac596 blue #90b5dc. Tints only where a row or field must carry them.
- Radius 8px base: controls 8, cards 12, badges/chips 6 — no pills except avatars.
- Rail follows the theme (light rail in light), hairline edge.
- Cards: border, no shadow at rest. Floats: border + one soft shadow.

## Rules audited against the restyle (founder: "not absolute")
45 conflicts found (DESIGN.md 26, WORKFLOW 1, one-look 1, icons 2, theme.ts 1, global-error 12, specs 6). Verdicts, to land in DESIGN.md with P1:
- KEEP intent, CHANGE check — one brand control per screen (WORKFLOW §3, controls.spec): hierarchy is the point, and the videos agree. It detects `data-variant="brand"`, not a gradient class. `one-look` rule 1 refuses the brand colour as a hand-written fill (`bg-brand`) outside button.tsx.
- KEEP — nothing lifts or scales on hover; logical CSS only (H3 protects RTL); Western digits; dark is the default; the red is the brand.
- KEEP intent, CHANGE values — theme-color / PWA / offline canvas must equal the canvas token (feel, pwa specs; theme.ts is the one source).
- REMOVE — "exactly two gradients". The running app gets none: gradients had nothing to say. The installed app icon (scripts/icons.ts) keeps its gradient, since it sits among other apps' icons.
- REMOVE — a card's resting shadow (§1, §1b card-face, §8 "considered and kept"). Borders, not shadows; a shadow only on what floats.
- CHANGE — state tone as a tinted pill (§1b TONE_CLASS, colour.spec). A state is a tone dot + its word. A tint is kept only for a band that carries a state across a whole row (lead band, viewing banner, warnings), and it is still never solid.
- CHANGE — fonts (Readex Pro, Plex Mono for figures) and the type scale. Plex Sans + Plex Sans Arabic; figures in tabular sans. The legibility reason ("an Arabic name on a phone stays legible") stays as a check in P1's review at 375 ar.
- CHANGE — Sandstone's warm chroma, 12/16 radii, rail dark in both themes. Evolves into restrained stone neutrals, 8/12 radii, a themed rail. Founder brief 2026-09-14 overrides S1's palette; the red and dark-default carry over.

## The line editor (founder 2026-09-15, reported three times as a stock form)
- Cause: a 13-column grid from `xl` with every label hidden under one header row, nine boxes of one weight, m² one more cell; services a second copy of the same table. Not the form kit's fields — the kit had no piece for a line of a paper, so each dialog hand-drew a spreadsheet.
- Kit: `ui-ext/line-item.tsx` (`LineItem` card: head = "Item N" + m² figure + money + remove; `LineFields` rows of 4 / 5 with a hairline between; `LineField` label always drawn; `LineFigure`), `FormSection` (14.5px semibold part name + hint + action), `FormSplit` (parts beside a sticky aside on a desk), `FormFooter summary` (m² and total over Save below xl). `Label` is the muted colour app-wide; values stay the text colour.
- Quotation and dispatch requests: who band → Panels (items) → Services (compact rows, units inside the boxes, subtotal row) → notes / Delivery and payment; totals, credit and SMAC number in the aside. A carried load line writes "Left to send N" under its count.
- Arabic: `dispatches.sending` «في هذا التوريد», `quotations.removeItem` «حذف البند» (en "Remove item"); typed figures in an Arabic item align with the chosen values (`rtl:text-end`).
- Shots: `shots/lines-before` vs `shots/lines-3` (`rep__quotation-request-full`, new manifest state).

## Remaining (in order)
1. S12.10: shoot every remaining manifest state (dialogs, empty, refused, loading, offline) at both widths, locales, themes; sweep against Stone; fix what repeats centrally.
2. Then Stage 2 ends: "switch to Fable and /audit", /cost.

## Known issues / notes
- React hydration warning when the search palette opens while the day's tab body is still streaming (Radix aria-hides the not-yet-hydrated page). Harmless; seen as the dev "2 Issues" badge in search-palette shots.
- Fire rating «Normal» shows in Latin on Arabic screens: `fire_ratings` (like suppliers and classes) has one name column, the founder's own values (B1 / A2 / Normal). A name_ar there is a schema change — founder's call.
- The request dialogs are taller than the grid was (a two-item paper scrolls at 1366): the price of every box carrying its label.
- Global sonner `closeButton` dropped: error toasts carry their own Close action.
- `TaskStop` on the chunk loop leaves the loop alive; `touch scratchpad/STOP`, then kill Kladra's node processes.

## Verification status
- Final gate (0d69156 tree): build green; full suite 811 passed, 4 skipped, 5 failed → sharing ×2 and drawers ×1 fixed in specs, admin (hydration timeout) and services (ERR_NETWORK_CHANGED) green on rerun; drawers 14/14, sharing/admin/services 26/26.
- Before/after sheets: scratchpad/before_after_1.jpg, before_after_2.jpg (rs-before vs rs-after).

## Exact next action
S12.10: `npx tsx scripts/shots.ts --label=s1210` over the whole manifest (dev 3100 up), sweep with a shot-looker per batch, fix centrally.
