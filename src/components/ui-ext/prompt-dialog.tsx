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
 *
 * `initialValue` is for the one use that edits rather than asks: correcting a
 * SMAC number opens on the number as it stands (D88), so a one-character typo
 * is a one-character fix.
 *
 * It is a FORM (D114): Rawan types SMAC's number and presses Enter, on her most
 * frequent act, instead of finding the button with the mouse. A reason is a
 * paragraph, so there Enter stays a new line and Ctrl/Cmd+Enter confirms.
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
  initialValue,
  context,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  /** A reason is a sentence; a SMAC number is not. */
  multiline?: boolean;
  /** What the field holds when the dialog opens — a correction starts from the current value. */
  initialValue?: string;
  /**
   * Whose record this is, under the title: the customer's name, so a number is
   * typed against a company and not against a bare label (D98).
   */
  context?: string;
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
    setValue(next ? (initialValue ?? "") : "");
    if (!next) setRefusal(null);
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
          {context ? (
            <p data-slot="prompt-context" className="text-sm font-medium">
              <bdi>{context}</bdi>
            </p>
          ) : null}
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) confirm();
          }}
          noValidate
          className="flex flex-col gap-4"
        >
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
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    if (!pending) confirm();
                  }
                }}
              />
            ) : (
              <Input
                id={fieldId}
                // A SMAC number is a Latin run and a reason is Arabic prose: each
                // takes its own direction, on either locale's page (DESIGN §5).
                dir="auto"
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
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
