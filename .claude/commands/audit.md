---
description: Audit everything built so far as a critic rather than its author, fix what you find, then continue.
---

Audit Kladra. Read the code as a critic who did not write it, not as its author.

Cover everything built so far, not only the last box. Use subagents in parallel where that is
faster — one writer per file — and read the screens in a real browser, not only in source.

Ask, of every screen and every query:

1. **Does this make a rep's day faster than the Google Sheet did?** That is the bar FACET
   failed. A screen that is merely correct is not finished.
2. **Is any of it record-first?** Does it show a record and wait, when it could show the
   decision the person came to make?
3. **Is a rule now wrong?** DESIGN.md, `.claude/rules/*`, SPEC §4 defaults — a rule written
   three boxes ago may have been overtaken. Fix the rule, not just the code.
4. **Where did each defect originate, and where else does it live?** Sweep for the cause. A
   fix applied in one place only is not finished: it needs the rule and the test as well.
5. **Both locales, both themes, 1366 and 375.** Arabic is not a translation layer over an
   English app; it is half the users.
6. **Is anything built but unreachable?** An action with no screen, a column with no writer,
   a message key nothing renders. Wire it or delete it.

Fix what you find in the same session. Green before every commit. Write what changed into
WORKFLOW §0 under "where I stopped", then continue from the first unchecked box exactly as
`/go` would — do not stop and report.
