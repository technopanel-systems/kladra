"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

/**
 * A write from a control that is not a form — the drawer's follow-up date, a
 * contact made main, a lead acknowledged — answered with a refusal (DESIGN §8).
 *
 * A failure the person has to act on stays until it is closed: the ordinary
 * toast's four seconds took "could not reach the server" away while the rep
 * was still reading the date that had quietly gone back. When nothing came
 * back at all (`reason: "unreachable"`, set by `useWireGuard` alone), its next
 * step is a button on it — the same press again, Try again, as the admin's
 * export does. A refusal the server did give has nothing to try again, so it
 * carries only its sentence. Both labels are the app's, in the reader's
 * language: the toast kit's own close mark is named in English.
 */
export function useFailureToast(): (
  refusal: { error: string; reason?: "unreachable" },
  retry: () => void,
) => void {
  const t = useTranslations();
  const tryAgain = t("shell.tryAgain");
  const close = t("common.close");

  return useCallback(
    (refusal, retry) => {
      toast.error(refusal.error, {
        duration: Infinity,
        action: refusal.reason === "unreachable" ? { label: tryAgain, onClick: retry } : undefined,
        cancel: { label: close, onClick: () => {} },
      });
    },
    [tryAgain, close],
  );
}
