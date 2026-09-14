import type { ProjectStage } from "@/lib/project-stage";

/**
 * The five words of a project's life (D170), literal so both locales are held
 * to each. The same word on the board's column, in the list's status cell and at
 * the head of the drawer, so "Open" is one thing on one screen (rules/words.md).
 */
export const STAGE_KEYS: Record<ProjectStage, string> = {
  open: "projects.stageOpen",
  quoted: "projects.stageQuoted",
  dispatching: "projects.stageDispatching",
  won: "projects.stageWon",
  lost: "projects.stageLost",
};
