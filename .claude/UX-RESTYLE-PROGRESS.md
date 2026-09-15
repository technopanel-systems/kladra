# UX restyle — progress (founder brief, 2026-09-14)

Lives under `.claude/` because hook H2 refuses a new .md anywhere else in the repo.
Part of P13-G6: the restyle is the design-system half of the front-end reshape.

## Current phase
Wave 3 building on the restyle (S12.4 quotations, S12.5 dispatches, S12.6+7 day/queue/team) in worktrees `.claude/worktrees/agent-*` from ee9af5b. The session ended mid-build once; the builders were resumed with their uncommitted work intact.

## Checkpoints (git)
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

## Remaining (in order)
1. Wave 3 on the new system: `python scratchpad/make_wave3.py <HEAD>` (now folds in restyle_contract.md), three builders in worktrees, merge, gate.
2. P4 consistency pass: every screen, 1366 + 375, en + ar, light + dark; fix repeated problems centrally. Seen so far: day cards colour their titles (Overdue red, Never contacted blue) → dot + neutral title; quotation rows 64px (status over date); pace text in amber.
3. DESIGN §8 verdicts; SPEC §4 defaults; full suite; WORKFLOW where-I-stopped; kit_pass items 5–8.

## Known issues / notes
- A global sonner `closeButton` was tried and dropped: error toasts already carry their own Close action (admin.spec export), and two Close buttons fail strict locators.
- First p2 run died in cascades of worker exits (0xC0000142) with dev 3100 + test 3101 + browsers up; rerun with 3100 stopped.

## Verification status
- P1: typecheck, lint, build green; 40 touched specs green; Arabic font verified by CDP probe + shots/rs-p1c.
- P2: full suite in 4 chunks — 799 passed, 4 skipped, 1 failed (filters chip row: the Arabic lookups now fit at 1366; spec asks overflow only on a phone) → filters.spec 8/8; lint, build green. Shots shots/rs-p2a.

## Exact next action
When each builder reports: `git -C <wt> diff d8699e0 <head>`-style merge (diff from its base ee9af5b to its head, `git apply --3way` on main), typecheck, lint, build, commit with its message; then the wave-3 gate (full suite, dev 3100 stopped), kit_pass items 5–8, P4 consistency pass.
