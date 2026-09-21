/**
 * The accounts file (SPEC §3, P14 14.10).
 *
 * One row per person with a login: who they are, what they may do, where the
 * system writes to them, and whether the account still opens. The list somebody
 * asks for when a new manager wants to know who has a key to the building.
 *
 * It is the users SCREEN, exported, and that screen has no address at all —
 * nothing on it narrows, searches or pages. So this asks the screen's own read
 * (`listUsers`) and flattens what comes back, rather than putting the same
 * question to the database a second way: a second query here would be a second
 * answer to "who works here" the day somebody adds a column to that one.
 *
 * The order is the screen's too: the accounts that still open first, then by
 * name. Nothing is ever deleted here, so a deactivated account stays on the
 * list and stays in the file (S7) — history that points at a missing person is
 * history nobody can read.
 *
 * **The name is resolved, not taken raw.** `listUsers` is the one read in the
 * app that keeps both names as they are stored, because the form above it edits
 * the pair (D68); the panel resolves them with `personNameFrom`, and so does
 * this, or an Arabic reader's list of his own colleagues would come out in
 * somebody else's script.
 *
 * Nobody's own floor, so the gate is not a narrowing but a role, and it is the
 * screen's: `runsTheOffice` in src/lib/authz.ts, the predicate `requireOffice`
 * is built on. Who works here is the sales manager's business as much as the
 * admin's, because he is the one who hires the rep (P14). The registry wires
 * it; this file only says which rows there are.
 */
import { getTranslations } from "next-intl/server";
import { listUsers } from "@/lib/admin";
import type { ExportRead } from "@/lib/export/kit";
import { personNameFrom } from "@/lib/person-name";

export const usersSheet: ExportRead = async ({ locale }) => {
  const [t, people] = await Promise.all([getTranslations({ locale }), listUsers()]);

  return {
    columns: ["person", "role", "email", "active"],
    // Nothing on an account is a quantity. The count of companies on somebody's
    // floor is on the screen and is not here: it is a figure about the
    // customers, it moves every time one is handed over, and the customers file
    // is where it can be counted against rows that say whose they are.
    rows: people.map((person) => ({
      person: personNameFrom(person, locale),
      // The same key the row on the screen renders the role with — one word per
      // role, in one place, for the screen and the file alike (DESIGN §5).
      role: t(`common.${person.role}`),
      email: person.email,
      // Both states get a word, and it is yes or no (messages/<locale>/export.json).
      // The screen says nothing over an account that works and marks the dead
      // ones «Inactive», which is right on a list you read down and wrong in a
      // column you sort by: a blank cell in a spreadsheet reads as "not known".
      // A file has flag columns where a screen has badges, so the two words are
      // the file's own vocabulary and the same pair in every one of them.
      active: t(person.active ? "export.yes" : "export.no"),
    })),
  };
};
