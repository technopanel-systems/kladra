# Motion

Sources: animation-timing, easing-curves, dropdown-design, tooltip-design, tabs-system,
accordion-disclosure, toggle-anatomy, card-hover-anatomy, reverse-engineered-linear, and
the Blueprint PDF's duration scale. See `sources.md` for URLs.

## Durations: the library against Kladra
| Moment | Library | Kladra (§1b, §2) | Verdict |
|---|---|---|---|
| Hover, colour, text change | 80–100ms | 100ms | Confirmed |
| Press feedback | under 100ms (Doherty) | the tint at 100ms | Confirmed |
| Menu, dropdown, popover open | 150ms (50 is too fast, 500 too slow) | 150ms | Confirmed |
| Tooltip appears after | **300ms delay**, so a pointer passing over does not fire it | kit default 0; sidebar 200 | **Take:** 300ms by default; the rail may keep 200 because it is a label for an icon the pointer is already aiming at |
| Dialog or drawer entrance | 200–300ms, ease-out | 200ms, ease-out | Confirmed |
| Exit | 30–40% faster than the entrance ("the user already decided") | ease-in, same band | **Take:** an exit is ~150ms against a 200ms entrance; check the kit's `data-[state=closed]` durations |
| Toggle flip | 250ms ease-out | Kladra has a switch in admin only | Use 150–200ms; a switch is not a dialog |
| Accordion panel | ~300ms, animate `grid-template-rows: 0fr → 1fr` (height:auto cannot transition); the chevron uses the same duration and curve | — | **Take the technique** at 200ms, if a slice adds a disclosure |
| Tab indicator | slides about 200ms; content fades out, then in | `PageTabs` are links, so there is no slide | Nothing to add; a panel switch must not jump the layout |
| Arrival highlight | — | 2000ms of colour, no travel | Kladra's own |
| Stagger a list in | 50ms per item | — | **Refused** (`refused.md`) |
| Spring or overshoot for presses and confirmations | damping 20–22, stiffness 180–200 | — | **Refused** |
| Attention motion, 500–800ms with bounce | — | — | **Refused** |

## Easing
- **Ease-out** for anything entering, **ease-in** for anything leaving, **ease-in-out** for
  something that moves or resizes in place (a row changing place).
- **Linear** only for continuous motion, which in Kladra is the pending mark.
- **Use the same few curves everywhere.** One consistent curve is a large part of what makes
  a product read as one hand. A component with its own cubic-bezier is a finding.

## Reduced motion
Travel (translate, scale) is dropped and duration and colour stay. The arrival flash keeps
its two seconds, because it is colour, not movement (§2).

## What never moves
- Nothing lifts, scales or tilts on hover (§1b).
- Nothing loops except the pending mark.
- Numbers never count up.
- Skeletons do not shimmer.
- No parallax and no scroll-driven effects on a work screen.
