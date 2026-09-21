"use client";

import { Check } from "lucide-react";
import { useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { registerInSmacAction } from "@/actions/quotations";
import { useFailureToast } from "@/components/companies/failure-toast";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * "Registered in SMAC" — the one act her backlog leads to (P14 14.6).
 *
 * The row says who is not in SMAC; the work is done in SMAC; and this is where
 * she says it is done, so the customer leaves the list. Without it the list
 * could only be read (`registerInSmacAction` says what that cost).
 *
 * Busy is not disabled (DESIGN §8): the button keeps its place and its focus
 * while the write is out, and a second press does nothing. The queue is server
 * rendered, so one refresh takes the row away (SPEC §3: no refresh buttons).
 */
export function RegisterInSmacButton({
  companyId,
  companyName,
}: {
  companyId: string;
  /** Whose row, for a reader who hears the button: every row has one. */
  companyName: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const working = useRef(false);
  const guarded = useWireGuard();
  const failed = useFailureToast();

  function register() {
    if (working.current) return;
    working.current = true;
    startTransition(async () => {
      const result = await guarded(registerInSmacAction)(companyId);
      working.current = false;
      if (!result.ok) {
        failed(result, register);
        return;
      }
      toast.success(t("queue.registeredInSmac", { company: companyName }));
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-busy={pending || undefined}
      aria-label={t("queue.registerInSmacFor", { company: companyName })}
      onClick={register}
    >
      <Check aria-hidden="true" />
      {pending ? t("common.saving") : t("queue.registerInSmac")}
    </Button>
  );
}
