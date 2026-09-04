// Shared contracts. Small on purpose; feature types live beside their queries.

export type Role = "rep" | "coordinator" | "manager" | "admin";

export const ROLES: readonly Role[] = ["rep", "coordinator", "manager", "admin"] as const;

/** What every server component and action gets from `requireUser()`. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: "en" | "ar";
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
  | { type: "project"; id: string };
