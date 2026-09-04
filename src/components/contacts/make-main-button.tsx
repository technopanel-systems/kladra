"use client";

import { Star } from "lucide-react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setMainContactAction } from "@/actions/contacts";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/**
 * "Make main" on a contact that is not the main one (SPEC D18: the main
 * contact is the one marked, or the oldest when nobody is). The first contact
 * added becomes main on its own, so this is only for the day the person a rep
 * actually deals with changes — which is why it is a quiet ghost button beside
 * the contact rather than a second field in a form.
 *
 * The drawer is server rendered, so one refresh moves the star and re-sorts
 * the list from the same query that drew it (SPEC §3: no refresh buttons).
 */
export function MakeMainButton({ contactId, name }: { contactId: string; name: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function makeMain() {
    startTransition(async () => {
      const result = await setMainContactAction(contactId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("drawer.mainSet", { name }));
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={makeMain}
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <Star aria-hidden="true" className="size-3.5" />
      {t("drawer.makeMain")}
    </Button>
  );
}
