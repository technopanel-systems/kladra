import type { DispatchStatus } from "@/lib/dispatches";

/**
 * Who may do what to a dispatch, as the drawer was told it (SPEC S8, S9).
 *
 * Pure and without a directive, because two sides ask it: the drawer's server
 * half, which builds "Add report", and the client row that draws the rest — a
 * function exported from a client module reaches a server component as a
 * reference it cannot call.
 */
export type DispatchScope = {
  /** She runs the chain: approve and refuse (S9). */
  coordinator: boolean;
  /** His company, so his request to change (S8). */
  owner: boolean;
};

/**
 * Which button on the drawer's action row wears the brand, for this reader
 * (DESIGN §2: one primary action; P13-G6, S12.5).
 *
 * Approve for the coordinator on a load waiting for her. The corrected request
 * for its rep on a load she refused — somebody owes an answer, and it is him
 * (`dispatchTone`), so the work is the button the eye lands on. Otherwise the
 * report, as on the company's and the project's drawers.
 */
export function dispatchBrand(status: DispatchStatus, scope: DispatchScope): "approve" | "edit" | "report" {
  if (scope.coordinator && status === "submitted") return "approve";
  if (scope.owner && status === "refused") return "edit";
  return "report";
}
