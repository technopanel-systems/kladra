/**
 * What the leads screen is narrowed to, read from its address and written back
 * (SPEC §3 P13, D145).
 *
 * Two filters and nothing else: who the lead is with, and whether that person
 * has acknowledged it. Both live in the URL, so the manager can send "every lead
 * Saad has not picked up" as a link and a refresh lands on the same rows. Every
 * chip and the person picker build their link here, so choosing one never drops
 * the other.
 *
 * Pure — no database, no `server-only` — so the server page parses with it and
 * the client filters build their links with it.
 */

import { isId } from "@/lib/id";

/** Acknowledged or not: the one state a lead has that a company does not. */
export const LEAD_STATES = ["waiting", "acknowledged"] as const;
export type LeadState = (typeof LEAD_STATES)[number];

export type LeadQuery = {
  /** Whose floor the lead is on. Absent is null, never "". */
  with: string | null;
  state: LeadState | null;
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The address, read. Anything unreadable is simply absent: a garbled `?with=` is
 * the whole list, not an error page — and never a value handed to a uuid cast
 * that would take the screen down (rules/data.md).
 */
export function parseLeadQuery(raw: Record<string, string | string[] | undefined>): LeadQuery {
  const person = one(raw.with)?.trim();
  const state = one(raw.state);
  return {
    with: isId(person) ? person : null,
    state: LEAD_STATES.includes(state as LeadState) ? (state as LeadState) : null,
  };
}

/** The same screen with one thing changed; `null` lets go of it. */
export function leadsHref(query: LeadQuery, patch: Partial<LeadQuery>): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.with) params.set("with", next.with);
  if (next.state) params.set("state", next.state);
  const search = params.toString();
  return search ? `/leads?${search}` : "/leads";
}
