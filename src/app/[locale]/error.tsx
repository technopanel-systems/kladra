"use client";

import { Trouble } from "@/components/shell/trouble";

/**
 * The boundary above the shell (§5 #20): what answers when the signed-in
 * layout itself cannot render — the database unreachable while it counts the
 * bell, most likely. There is no rail to stand in, so the card stands alone
 * on the canvas with the mark, the way the sign-in screen does. Theme and
 * language are still the reader's: both live in the root layout, which is
 * still standing.
 */
export default function LocaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <Trouble kind="failed" onRetry={reset} bare />;
}
