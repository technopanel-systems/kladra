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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/types";

/**
 * Ask one thing, then act — the sibling of ConfirmDialog for the decisions that
 * need a word written down.
 *
 * There are four of them on the quotation chain alone: the SMAC number that
 * issues a quotation, the reason it was sent back, the reason a customer
 * rejected it, and the same again on a dispatch. Every one is "a decision that
 * ends someone's work reaches them with its written reason" (S53), and four
 * hand-written copies of that dialog is four chances for one of them to let the
 * reason through empty.
 *
 * The button is never disabled while the field is empty. An empty reason is
 * refused by the action, in the app's own sentence, at the field — the same
 * answer as every other rejected input (DESIGN §5).
 */
export function PromptDialog({
  trigger,
  title,
  description,
  label,
  placeholder,
  multiline,
  confirmLabel,
  successMessage,
  onConfirm,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  /** A reason is a sentence; a SMAC number is not. */
  multiline?: boolean;
  confirmLabel: string;
  successMessage: string;
  onConfirm: (value: string) => Promise<ActionResult<unknown>>;
  /** Runs after the action succeeds — refresh, or navigate away. */
  onDone?: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setValue("");
      setRefusal(null);
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = await onConfirm(value.trim());
      if (!result.ok) {
        // At the field, not only in a toast: the field is where the eye is and
        // where the fix has to happen.
        setRefusal(result.fieldErrors ? Object.values(result.fieldErrors)[0] : result.error);
        return;
      }
      toast.success(successMessage);
      onOpenChange(false);
      onDone?.();
    });
  }

  const fieldId = "prompt-field";
  const errorId = "prompt-error";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId}>{label}</Label>
          {multiline ? (
            <Textarea
              id={fieldId}
              rows={3}
              disabled={pending}
              value={value}
              placeholder={placeholder}
              aria-invalid={refusal ? true : undefined}
              aria-describedby={refusal ? errorId : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : (
            <Input
              id={fieldId}
              disabled={pending}
              autoComplete="off"
              value={value}
              placeholder={placeholder}
              aria-invalid={refusal ? true : undefined}
              aria-describedby={refusal ? errorId : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
          {refusal ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {refusal}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
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
