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
 *
 * `children` is for the one confirmation that needs an answer as well as a
 * yes — handing a company over asks WHO. A fourth hand-written dialog beside
 * this one is how three confirmations end up disagreeing about how dangerous
 * the same act is; a slot in the middle of this one is not.
 *
 * The confirm button is never disabled while that answer is missing. A control
 * that cannot be pressed reads as a broken screen (DESIGN §5), and the action
 * behind this already has a sentence for the case — which is the app's own
 * sentence, in the reader's language, rather than a button quietly refusing to
 * light up and explaining nothing.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
  onConfirm,
  onDone,
  children,
  onOpenChange,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  onConfirm: () => Promise<ActionResult<unknown>>;
  /** Runs after a confirmed action succeeds — refresh, or navigate away. */
  onDone?: () => void;
  /** The question this confirmation also has to ask, between text and buttons. */
  children?: ReactNode;
  /** So a caller can clear what it asked when the dialog closes. */
  onOpenChange?: (open: boolean) => void;
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
      change(false);
      onDone?.();
    });
  }

  function change(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : change}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => change(false)}>
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
