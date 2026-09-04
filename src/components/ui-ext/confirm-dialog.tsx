"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import type { ActionResult } from "@/lib/types";

/**
 * "Are you sure?" — one implementation, for every action that takes something
 * off a rep's floor (SPEC §3: archive, never delete).
 *
 * Archiving is not destructive; nothing is lost and an admin can put it back.
 * But it does make a row disappear, and a row that vanishes with no warning
 * reads as a bug rather than a decision — so it asks first, names the thing in
 * the question, and says what actually happens.
 *
 * Three of these were about to be written by hand for companies, contacts and
 * projects. One confirm that drifts is three confirms that disagree about how
 * dangerous the same act is.
 *
 * `onConfirm` returns the action's own ActionResult, so a refusal shows the
 * sentence the server wrote and leaves the dialog open with the button live
 * again — a rep can read it and try, rather than losing the dialog and the
 * reason together.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
  onConfirm,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  onConfirm: () => Promise<ActionResult>;
  /** Runs after a confirmed action succeeds — refresh, or navigate away. */
  onDone?: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      onDone?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={pending} onClick={confirm}>
            {pending ? t("common.saving") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
