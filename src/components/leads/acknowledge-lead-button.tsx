"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { acknowledgeLeadAction } from "@/actions/companies";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * "I have him" — the rep answers the lead he was given (SPEC §3, P12-7).
 *
 * Its own press rather than a side effect of opening the drawer, because what
 * marketing needs to know is that somebody has taken the call. A row cleared by
 * a passing click would answer nobody, and the figure on the manager's stuck
 * list would then be measuring who had opened a screen.
 *
 * It is offered to the person holding the lead and to nobody else — the same
 * sentence the action asks (`mayWrite`), so the button is never a door the
 * server would shut (DESIGN §5). Pressing it takes the notice off his bell,
 * takes the row off his day, and tells the person who filed it.
 *
 * The drawer is server rendered, so one refresh redraws the band, the bell and
 * the list behind it from the queries that drew them (SPEC §3: no refresh
 * buttons).
 */
export function AcknowledgeLeadButton({ companyId }: { companyId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();

  function acknowledge() {
    startTransition(async () => {
      const result = await guarded(acknowledgeLeadAction)(companyId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("leads.acknowledgedToast"));
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={acknowledge}>
      <Check aria-hidden="true" />
      {t("leads.acknowledge")}
    </Button>
  );
}
