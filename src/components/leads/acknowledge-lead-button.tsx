"use client";

import { Check } from "lucide-react";
import { useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { acknowledgeLeadAction } from "@/actions/companies";
import { useFailureToast } from "@/components/companies/failure-toast";
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
 * Busy is not disabled (DESIGN §8, S12.1): while the write is out the button
 * keeps its place and its focus, says so in words and to a screen reader, and a
 * second press does nothing. A refusal stays on screen until it is closed, with
 * Try again when the server was not reached.
 *
 * The drawer is server rendered, so one refresh redraws the band, the bell and
 * the list behind it from the queries that drew them (SPEC §3: no refresh
 * buttons).
 */
export function AcknowledgeLeadButton({
  companyId,
  companyName,
}: {
  companyId: string;
  /**
   * Whose lead, for a reader who hears the button rather than sees its row: the
   * band has one Acknowledge per lead, and five buttons all called "Acknowledge"
   * cannot be told apart (Reassign says its customer the same way). The drawer's
   * one button is about the drawer it is in, and needs none.
   */
  companyName?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const working = useRef(false);
  const guarded = useWireGuard();
  const failed = useFailureToast();

  function acknowledge() {
    if (working.current) return;
    working.current = true;
    startTransition(async () => {
      const result = await guarded(acknowledgeLeadAction)(companyId);
      working.current = false;
      if (!result.ok) {
        failed(result, acknowledge);
        return;
      }
      toast.success(t("leads.acknowledgedToast"));
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-busy={pending || undefined}
      onClick={acknowledge}
    >
      <Check aria-hidden="true" />
      {pending ? t("common.saving") : t("leads.acknowledge")}
      {companyName ? (
        <span className="sr-only">
          {" "}
          <bdi>{companyName}</bdi>
        </span>
      ) : null}
    </Button>
  );
}
