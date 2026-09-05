// Shared contracts. Small on purpose; feature types live beside their queries.

/**
 * Marketing was added in P8.9. SPEC §1 had said "Marketing works as a rep for
 * now", and that "for now" had a cost: a lead generator with a rep's role
 * carries a monthly m² target he can never meet and sits on the manager's team
 * table as a permanent row of dashes.
 */
export type Role = "rep" | "marketing" | "coordinator" | "manager" | "admin";

/** What every server component and action gets from `requireUser()`. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: "en" | "ar";
  /**
   * Set only while an admin is looking at the app as this person (P8.8). Its
   * presence is what makes every write refuse, so it is on the user rather than
   * in a context somebody could forget to read.
   */
  viewedBy?: { id: string; name: string };
};

/** Result shape every server action returns; forms read `error` and `fieldErrors`. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Live-update event pushed over SSE to the users it concerns. */
export type LiveEvent =
  | { type: "quotation"; id: string; number: string; status: string }
  | { type: "dispatch"; id: string; number: string; status: string }
  | { type: "notification"; id: string; unread: number }
  | { type: "company"; id: string }
  | { type: "project"; id: string }
  // A daily report landing. The manager reads the screen while the floor is still
  // writing on it, and a participation count that has gone stale reads exactly
  // like a missed day (D57) — which is the one thing it must never do.
  | { type: "report"; id: string; day: string };
