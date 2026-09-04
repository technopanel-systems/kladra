"use client";

import { Archive } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { archiveCompanyAction } from "@/actions/companies";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Archive, never delete (SPEC §3, S16). The company leaves every list and its
 * history stays, so a customer who resurfaces in two years still shows what
 * happened last time; an admin can put it back.
 *
 * It asks first. Archiving is not destructive — nothing is lost — but it does
 * take a company off the rep's floor, and a row that vanishes with no warning
 * reads as a bug rather than a decision.
 *
 * Afterwards the drawer has nothing left to show, so this navigates back to the
 * plain list rather than refreshing into a company that is no longer in it.
 */
export function ArchiveCompanyDialog({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveCompanyAction(companyId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("drawer.archived", { name: companyName }));
      setOpen(false);
      router.push(pathname === "/companies" ? "/companies" : pathname);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-muted-foreground">
          <Archive aria-hidden="true" />
          {t("drawer.archive")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("drawer.archiveTitle", { name: companyName })}</DialogTitle>
          <DialogDescription>{t("drawer.archiveWarning")}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={pending} onClick={archive}>
            {pending ? t("common.saving") : t("drawer.archive")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
