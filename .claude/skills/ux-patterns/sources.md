# Sources

Everything was read on 2026-09-14 from public pages. The paid UX Engine plugin and its manual
were not bought and not sought; the founder did not want to buy them. Every rule in this
skill is paraphrased.

## designmotionhq
- Site: https://designmotionhq.com. The home page is the UX Engine sales page, and its public
  copy describes the eight skills and four commands that `lens.md` draws on.
  https://designmotionhq.com/about. The site's own UI tokens and anatomy are in
  `notes/site/site-ui.txt`, and the product framework is in `notes/site/content.txt`.
- The free PDF, "Design System Blueprint" (11 pages): the founder's upload. Its text is in
  `notes/site/blueprint-pdf.txt`, and its look is described in `visual.md`.
- Instagram `@designmotionhq` and TikTok `@designmotionhq` need a login and were not read
  (`notes/site/social.txt`). YouTube Shorts are at
  https://www.youtube.com/@designmotionhq_yt. Most repeat a pattern page. Fitts's law
  (E2TNSk10BZc), kanban (HNbb5t_iDBM) and card input (ai7ExJmtxcY) do not, and are in
  `notes/patterns/yt-*.txt`.
- Pattern videos: `https://pub-8b35602514014e9aa3363da6c7b5416c.r2.dev/videos/<slug>.mp4`.

## The 76 patterns, ranked for Kladra
Each has a full reading in `notes/patterns/<slug>.txt`: rules with their numbers, do and
don't, what the video shows beyond the text, where it lands in Kladra and any conflict. The
takeaway lines below are the readers' own, so where a line argues for something
`refused.md` rules out, `refused.md` wins.

| Pattern | For Kladra | Takeaway |
|---|---|---|
| [accordion-disclosure](https://designmotionhq.com/patterns/accordion-disclosure) | high | height:auto can't transition — use grid-template-rows or measured scrollHeight, and drive the chevron off the same curve as the panel. |
| [animation-timing](https://designmotionhq.com/patterns/animation-timing) | high | entrances 200-300ms ease-out, exits ~40% faster, tap feedback under 100ms — gives Kladra's motion-timing rule real numbers. |
| [behind-the-button](https://designmotionhq.com/patterns/behind-the-button) | high | client validation is speed, server validation is truth — recompute price server-side, wrap related writes in one transaction, no optimistic UI on money. |
| [charts-that-lie](https://designmotionhq.com/patterns/charts-that-lie) | high | zero-baseline axis, chart type matched to the question, honest aspect ratio, title = the takeaway — the craft checklist behind Kladra's "no decorative chart" rule. |
| [color-accessibility](https://designmotionhq.com/patterns/color-accessibility) | high | 4.5:1 / 3:1 / 7:1 contrast targets plus a second non-color signal on every state — the numeric backing for "never colour alone." |
| [command-palette](https://designmotionhq.com/patterns/command-palette) | high | fuzzy match, grouped results, prefilled recents, full keyboard control — a near-complete, conflict-free spec for Kladra's planned search palette. |
| [dark-mode](https://designmotionhq.com/patterns/dark-mode) | high | near-black base (#121212) with layered surfaces, desaturated accents, off-white text tiers — not inverted light mode; a foundational check for a dark-by-default app. |
| [data-table](https://designmotionhq.com/patterns/data-table) | high | tri-state sort, tabular right-aligned numbers, sticky header/frozen column — adopt directly, but reject the density-toggle and bulk-row-select rules as written. |
| [date-pickers](https://designmotionhq.com/patterns/date-pickers) | high | presets first (1 click vs 6), two months side by side, full keyboard, full-screen sheet on mobile; RTL/Hijri is the one open question. |
| [design-system-kit](https://designmotionhq.com/patterns/design-system-kit) | high | the completeness checklist for a real token system — color/type/spacing/component/motion scales, named, not eyeballed. |
| [design-tokens](https://designmotionhq.com/patterns/design-tokens) | high | three-layer token architecture (primitive → semantic → component) so a theme or locale change is a token swap, not a hunt-and-replace. |
| [destructive-actions](https://designmotionhq.com/patterns/destructive-actions) | high | danger needs its own language — verb-labeled buttons, a small red budget, placement away from the safe default, a cancellable grace period. |
| [disabled-buttons](https://designmotionhq.com/patterns/disabled-buttons) | high | a disabled button must say why, or better, stay enabled and validate on submit — disabling alone breaks keyboard access and tooltips. |
| [doherty-threshold](https://designmotionhq.com/patterns/doherty-threshold) | high | respond within ~400ms or the user mentally disconnects — the reason optimistic UI and instant feedback exist. |
| [dropdown-design](https://designmotionhq.com/patterns/dropdown-design) | high | 48px clickable trigger, flip on edge, full keyboard, search past ~10 items — used on nearly every form and filter Kladra has. |
| [empty-states](https://designmotionhq.com/patterns/empty-states) | high | four kinds of empty (first run / no results / error / filtered-out), each its own copy and one primary CTA, never a bare "No data." |
| [error-states](https://designmotionhq.com/patterns/error-states) | high | match error type and severity to surface (inline/toast/modal), always give an exit, prevent most errors with live validation. |
| [file-upload-ux](https://designmotionhq.com/patterns/file-upload-ux) | high | five states — drag feedback, honest percent+time-left, inline retry without restart, real thumbnail preview, independent per-file queue — replace a bare file input. |
| [filter-chips](https://designmotionhq.com/patterns/filter-chips) | high | three distinct chip states, instant result count, one clear-all, single scrolling row on mobile — especially important given Kladra's "no saved views" ban. |
| [focus-states](https://designmotionhq.com/patterns/focus-states) | high | never remove the ring without replacing it — :focus-visible, DOM order = visual order, trap focus in dialogs/drawers. |
| [form-field-states](https://designmotionhq.com/patterns/form-field-states) | high | a field has six real states (default/focus/error/success/disabled/loading), most apps design two. |
| [form-validation-timing](https://designmotionhq.com/patterns/form-validation-timing) | high | validate on blur first, live after the first error — never every keystroke, never only on submit. |
| [grid-system](https://designmotionhq.com/patterns/grid-system) | high | one 12-column grid, one fixed gutter (24px reads "balanced," the single choice that fits Kladra's no-density-toggle rule), verified per breakpoint. |
| [hover-trap](https://designmotionhq.com/patterns/hover-trap) | high | Hover reveals extras only, never a primary action; gate with `hover:hover`/`pointer:coarse` and pad touch targets to 44px — Kladra's list-row hover actions need a touch-safe home for the phone layout. |
| [inline-editing](https://designmotionhq.com/patterns/inline-editing) | high | Editable text needs a visible affordance, zero layout shift on edit, and one consistent save rule (blur/enter) — core to every editable field in Kladra's records. |
| [loading-states-system](https://designmotionhq.com/patterns/loading-states-system) | high | Pick the loading indicator from what's known about the wait (spinner/skeleton/progress bar/optimistic/none), not by default — a five-way decision tree to apply across every Kladra screen. |
| [microcopy](https://designmotionhq.com/patterns/microcopy) | high | Word choice alone changes usability; write labels/errors/empty-states in plain, human language, not system-speak — touches every screen in both locales. |
| [modal-hierarchy](https://designmotionhq.com/patterns/modal-hierarchy) | high | Match overlay weight to action weight (popover < sheet/drawer < modal); reserve full modals for truly blocking, high-stakes actions. |
| [navigation-patterns](https://designmotionhq.com/patterns/navigation-patterns) | high | Pick nav shape by platform and hierarchy depth, not taste; hiding primary nav behind a hamburger measurably kills engagement. |
| [notification-system](https://designmotionhq.com/patterns/notification-system) | high | Route each event to the surface matching its severity (inline/toast/badge/blocking) — never make every event equally loud, or users tune all of them out. |
| [optimistic-ui](https://designmotionhq.com/patterns/optimistic-ui) | high | Update the UI instantly for reversible, near-certain actions and reconcile after the server confirms; keep quotations/dispatches honest with a clear rollback boundary. |
| [pagination](https://designmotionhq.com/patterns/pagination) | high | Cursor-based paging (not offset) plus URL-persisted page state and scroll restoration prevents duplicate/missing rows when the underlying list changes mid-browse. |
| [perfect-card](https://designmotionhq.com/patterns/perfect-card) | high | Padding, type hierarchy via weight/opacity, layered shadow, and a deliberate hover state are the four decisions that separate a "premium" card from a "free" one — audit every card surface against this. |
| [proximity-rule](https://designmotionhq.com/patterns/proximity-rule) | high | Related elements need visibly tighter spacing than unrelated ones, or the eye has to parse every item individually — codify as a spacing-token pair, not a one-off fix. |
| [reverse-engineered-linear](https://designmotionhq.com/patterns/reverse-engineered-linear) | high | Density, flat surfaces over shadows, one accent color, and visible keyboard shortcuts are what make an interface feel "expensive" without decoration — near-direct style reference for Kladra's list/queue surfaces. |
| [search-experience-system](https://designmotionhq.com/patterns/search-experience-system) | high | Search is five coordinated parts (input, live results, ranking, zero-state, recovery) not one box — Kladra's search palette needs all five, not just the input. |
| [stepper-wizard](https://designmotionhq.com/patterns/stepper-wizard) | high | Split long multi-field forms into meaningfully grouped steps with per-step validation and state persistence, so a rep never loses a half-entered quotation on Back or refresh. |
| [tabs-system](https://designmotionhq.com/patterns/tabs-system) | high | Tabs must solve indicator motion, overflow, keyboard nav, mobile collapse, and content transition together — concrete timing numbers are directly implementable. |
| [toast-notifications](https://designmotionhq.com/patterns/toast-notifications) | high | Tiered duration (short/long/until-acknowledged), a damped stacking spring, and icon+border (never colour alone) are the numbers Kladra's toast system currently lacks. |
| [undo-ux](https://designmotionhq.com/patterns/undo-ux) | high | Let the destructive action happen instantly with a brief undo window, instead of a blocking "Are you sure?" modal on every delete — less friction for daily use. |
| [visual-hierarchy](https://designmotionhq.com/patterns/visual-hierarchy) | high | Stack size, colour, contrast, whitespace and weight toward one focal point per screen; one-accent-color is the most auditable rule during the re-audit. |
| [autosave-ux](https://designmotionhq.com/patterns/autosave-ux) | medium | debounce ~800ms, an honest state-machine status pill, an offline queue, warn before an unsaved close. |
| [border-radius](https://designmotionhq.com/patterns/border-radius) | medium | nested corners need concentric radii (outer = inner + padding) or the nesting reads as "off." |
| [bottom-sheets](https://designmotionhq.com/patterns/bottom-sheets) | medium | mobile actions belong within thumb reach in a bottom sheet with drag-to-dismiss and snap points, not a top-anchored menu. |
| [card-hover-anatomy](https://designmotionhq.com/patterns/card-hover-anatomy) | medium | four hover signals together (lift, shadow, border/accent, content reveal) at a consistent short duration make a card feel alive. |
| [context-menu](https://designmotionhq.com/patterns/context-menu) | medium | measure and flip to fit the viewport, group actions with dividers, safe-triangle for submenus, long-press equivalent on mobile. |
| [css-has-selector](https://designmotionhq.com/patterns/css-has-selector) | medium | :has() replaces a lot of derived React state (checked/invalid/open/child-count styling) — an implementation win, not a UX change. |
| [easing-curves](https://designmotionhq.com/patterns/easing-curves) | medium | linear only for continuous motion, ease-out for entrances, spring reserved narrowly — don't take "spring always wins" literally for a utilitarian CRM. |
| [gestalt-laws](https://designmotionhq.com/patterns/gestalt-laws) | medium | proximity, similarity, continuity, closure, figure-ground as a free audit lens on layouts already built. |
| [gradient-design](https://designmotionhq.com/patterns/gradient-design) | medium | a gradient stays premium within ~60° of hue travel and one lightness direction, but most of the pattern (mesh, ambient glow, gradient text) should be declined outright under Kladra's two-gradient cap — useful only as craft rules for the two gradients already allowed. |
| [icon-design-rules](https://designmotionhq.com/patterns/icon-design-rules) | medium | Icons are judged optically not mathematically — same visual weight, not identical pixel math; mainly an audit risk for Kladra's non-library icons (logo, custom status glyphs). |
| [input-masking](https://designmotionhq.com/patterns/input-masking) | medium | Format digits live without breaking caret position or validating before the field is complete — narrow surface (phone fields) but easy to get wrong. |
| [password-field-ux](https://designmotionhq.com/patterns/password-field-ux) | medium | A live strength meter plus checklist beats a static rule list validated only after submit. |
| [peak-end-rule](https://designmotionhq.com/patterns/peak-end-rule) | medium | Users remember a flow by its most intense moment and its ending, not the average — invest in the final screen of quotation/dispatch/lead flows; tone down the pattern's confetti-style "delight" to fit Kladra's restraint. |
| [serial-position](https://designmotionhq.com/patterns/serial-position) | medium | People recall the first and last items of a list far better than the middle — a lens for ordering nav, onboarding, and wizard steps, not a component to build. |
| [settings-system](https://designmotionhq.com/patterns/settings-system) | medium | Group settings by task, not schema; instant-apply for low-stakes fields, explicit save for identity fields, and quarantine destructive actions behind a divider and confirmation. |
| [shadow-elevation](https://designmotionhq.com/patterns/shadow-elevation) | medium | Shadow should encode hierarchy (a layered recipe: contact + mid + optional glow), not be one flat value copy-pasted everywhere — reusable for drawers/dialogs/dropdowns. |
| [skeleton-loading](https://designmotionhq.com/patterns/skeleton-loading) | medium | Content-aware skeleton shapes and RTL-aware shimmer direction are useful; the core animated-shimmer recommendation is blocked by Kladra's static-skeleton rule. |
| [toggle-anatomy](https://designmotionhq.com/patterns/toggle-anatomy) | medium | A toggle needs animated movement, keyboard/screen-reader support, and optimistic pending state — secondary control, but the optimistic pattern reapplies elsewhere. |
| [tooltip-design](https://designmotionhq.com/patterns/tooltip-design) | medium | A pre-show delay (~300ms), viewport-aware flipping, and multiple dismiss routes turn a tooltip from annoying to helpful — standardize once across icon buttons. |
| [von-restorff](https://designmotionhq.com/patterns/von-restorff) | medium | Isolate exactly one element per view (the primary CTA, a genuinely urgent record) so it's noticed and chosen — already implicit in Kladra's two-gradient/one-accent rule; don't let it become a promotional badge. |
| [bulk-actions](https://designmotionhq.com/patterns/bulk-actions) | low | bulk selection needs a real state system, but bulk edit itself is banned in Kladra — only the undo-instead-of-confirm idea survives. |
| [color-picker-ux](https://designmotionhq.com/patterns/color-picker-ux) | low | OKLCH, memory, live contrast, alpha-on-checkerboard — moot since Kladra's colors are fixed design tokens, not user-chosen. |
| [de-ai-landing-hero](https://designmotionhq.com/patterns/de-ai-landing-hero) | low | five AI-landing-page tells and their fixes — Kladra has no public marketing hero; only "show the real thing, not decoration" transfers. |
| [depth-layers](https://designmotionhq.com/patterns/depth-layers) | low | layered shadows for elevation — a cheap DESIGN.md token upgrade; parallax and z-hover don't fit a CRM or duplicate card-hover-anatomy. |
| [drag-and-drop](https://designmotionhq.com/patterns/drag-and-drop) | low | pickup/drop-zone/snap/undo feedback for drag interactions — directly banned as an interaction model in Kladra; only the undo-toast idea carries over. |
| [golden-ratio](https://designmotionhq.com/patterns/golden-ratio) | low | proportion as a gut-check for spacing/type scale — Kladra's screens are mostly single-pane and already on an 8px scale, so little changes. |
| [landing-page-skeleton](https://designmotionhq.com/patterns/landing-page-skeleton) | low | Five proven marketing-page sections in the right order — Kladra has no landing page, so only general copy discipline carries over. |
| [live-cursors](https://designmotionhq.com/patterns/live-cursors) | low | Identity-color-hashed multiplayer cursors with reconciled (not raw) position updates — no multiplayer canvas in Kladra to apply this to. |
| [otp-input](https://designmotionhq.com/patterns/otp-input) | low | One shared string across six boxes (not six independent inputs) plus a disabled, countdown-gated resend — no OTP flow in Kladra today, but the countdown-resend idea reapplies to any retry action. |
| [range-sliders](https://designmotionhq.com/patterns/range-sliders) | low | A thick filled track, a large thumb hit area, and a value tooltip that follows the drag make a slider usable — no slider surface exists in Kladra yet. |
| [scroll-driven-animations](https://designmotionhq.com/patterns/scroll-driven-animations) | low | Native CSS scroll-linked animation replaces JS scroll listeners — Kladra is data-dense, not scroll-driven; risks reading as decoration if used cosmetically. |
| [star-rating](https://designmotionhq.com/patterns/star-rating) | low | Hover preview kept separate from the committed value, and honest (non-rounded) fractional-average rendering — no review/rating surface in Kladra's domain. |
| [swipe-actions](https://designmotionhq.com/patterns/swipe-actions) | low | Swipe needs real physics, direction semantics, and an undo safety net to avoid becoming a data-loss bug — not actionable unless the founder decides to introduce gesture-based row actions. |
| [z-index-mastery](https://designmotionhq.com/patterns/z-index-mastery) | low | Z-index only matters once there's a positioning/stacking context; use `isolation: isolate` and DevTools Layers instead of escalating numbers — implementation hygiene, not a UI decision. |
| [zeigarnik-effect](https://designmotionhq.com/patterns/zeigarnik-effect) | low | A visible, meaningful gap (not 100% completion) keeps users returning — narrow use cases in Kladra, and the tempting animated-completion-meter execution conflicts with "no looping motion." |

## Deeper topics
- `notes/site/deeper.txt` covers state completeness, action hierarchy and visual character,
  from NN/g (empty states, button states), Apple HIG (destructive actions) and writing on
  Stripe, Linear and Vercel.
- `notes/site/deeper2.txt` covers boards without drag, target size, motion restraint and dense
  bilingual screens. Its sources: W3C WCAG 2.2 (2.5.7, 2.5.8, 2.5.5, 2.3.3, 2.2.2, 1.4.1,
  3.1.2), W3C inline bidi markup and ALReq, NN/g (Fitts's law, horizontal scrolling, attention
  leaning left, animation duration, distracting animations), Material 3 motion tokens (the
  material-components-android repo), Material's archived bidirectionality guideline, Apple's
  archived RTL guidance, Atlassian's pragmatic drag-and-drop accessibility guidelines and grid,
  Vercel's web interface guidelines, Emil Kowalski's animation tips, Hoober's thumb study
  (UXmatters), AG Charts RTL, Google Fonts metrics, and GOV.UK backlog issue #252. Full URLs
  are at the end of each topic in that file.
