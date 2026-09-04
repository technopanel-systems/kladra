---
description: Continue building Kladra from the first unchecked box in WORKFLOW §0, without stopping.
---

Read `WORKFLOW.md` §0 and §2, then continue from the **first unchecked box**.

You are building Kladra for Technopanel. §2 is the charter and it governs: you own this
system, you decide how it gets built, and you do not stop until it is finished.

- No pause between boxes. No permission. No report until the work is done.
- Inside a box: schema → query → server action → screen → both locales → Playwright →
  shot-looker → arabic-reviewer → fix → web-design-guidelines review.
- Every defect gets asked where it originated and where else it lives. Fix all of it, write
  the rule in DESIGN.md, add the test that stops it coming back.
- Green before every commit: `npm run typecheck && npm run lint && npm run build && npm run test`.
  If a box cannot get green, cut scope inside it and note the cut in §0.
- At the end of every box: run the checkpoint audit from §2, tick the box, update "where I
  stopped", commit, and start the next box immediately.
- Defaults get picked, not asked. Record each in SPEC §4 as "DEFAULT — founder may change".
  SPEC §3 is what real users asked for; overrule an item only by writing why in §4.

If a usage limit or a model change ended the last session, start by reading §0 to see where it
stopped, and treat the previous model's work as another developer's: audit it before building on it.
