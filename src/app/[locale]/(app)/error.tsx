"use client";

import { Trouble } from "@/components/shell/trouble";

/**
 * The boundary under the shell (§5 #20). A screen that threw is replaced by
 * one card; the rail and the bar stay, so a rep is still somewhere he knows.
 * `reset` renders the segment again — for a query that failed once, that is
 * usually all it takes. The cause stays in the server log, never on screen;
 * Next writes the same digest to the browser console itself, so nothing is
 * logged twice here.
 */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <Trouble kind="failed" onRetry={reset} />;
}
