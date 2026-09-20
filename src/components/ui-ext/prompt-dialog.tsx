"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
 *
 * `destructive` presses a button in the tint, never the brand, for the answer
 * that ends somebody's request — refusing a load (P13-G6, S12.5) — in the shape
 * ConfirmDialog already takes it: the trigger that opened it is in the tint, and
 * a brand-red Refuse behind it would say the opposite of the button pressed.
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
  tick,
  destructive = false,
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
  /**
   * One more thing, ticked or not, for the one answer that settles two facts
   * at once: issuing a quotation is also the moment the coordinator creates the
   * customer in SMAC, so she says both here rather than going to look for the
   * company afterwards (SPEC §3, P14). Absent everywhere else, which is three
   * of the four uses.
   */
  tick?: { label: string; hint?: string };
  onConfirm: (value: string, ticked: boolean) => Promise<ActionResult<unknown>>;
  /** Runs after the action succeeds — refresh, or navigate away. */
  onDone?: () => void;
  /** The answer ends somebody's request: the confirm button is in the tint. */
  destructive?: boolean;
}) {
  const guarded = useWireGuard();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  // Off every time it opens, like the box above it: a tick that remembered the
  // last customer would answer a question about this one.
  const [ticked, setTicked] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [formRefusal, setFormRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    setValue(next ? (initialValue ?? "") : "");
    setTicked(false);
    if (!next) {
      setRefusal(null);
      setFormRefusal(null);
    }
  }

  function confirm() {
    startTransition(async () => {
      // Guarded: no answer at all is a refusal too, not the error card (D132).
      const result = await guarded(onConfirm)(value.trim(), ticked);
      if (!result.ok) {
        // At the field when the field is what was refused — that is where the
        // eye is and where the fix has to happen — and in the footer when the
        // whole attempt was, so a server that was not reached does not paint
        // the number red (D132).
        const atField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : null;
        setRefusal(atField ?? null);
        setFormRefusal(atField ? null : result.error);
        return;
      }
      toast.success(successMessage);
      onOpenChange(false);
      onDone?.();
    });
  }

  const ids = useId();
  const fieldId = `${ids}-field`;
  const errorId = `${ids}-error`;
  const tickId = `${ids}-tick`;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={title}
      context={context}
      description={description}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) confirm();
        }}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <FormBody>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>{label}</Label>
            {multiline ? (
              <Textarea
                id={fieldId}
                rows={3}
                // A reason is prose in whichever language it was typed in.
                dir="auto"
                // Read-only while it saves, not disabled: the caret stays, so
                // a refused answer is corrected where the finger already is.
                readOnly={pending}
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
                readOnly={pending}
                autoComplete="off"
                // A SMAC number or a new password, never prose: nothing to
                // correct and nothing to suggest.
                spellCheck={false}
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

          {tick ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={tickId}
                  checked={ticked}
                  disabled={pending}
                  // The hint says what ticking costs her — her name against it,
                  // and nobody asked again — which is the part a reader who
                  // never sees the grey line under the box would lose.
                  aria-describedby={tick.hint ? `${tickId}-hint` : undefined}
                  onCheckedChange={(checked) => setTicked(checked === true)}
                />
                <Label htmlFor={tickId} className="font-normal text-foreground">
                  {tick.label}
                </Label>
              </div>
              {tick.hint ? (
                <p id={`${tickId}-hint`} className="text-xs text-muted-foreground">
                  {tick.hint}
                </p>
              ) : null}
            </div>
          ) : null}
        </FormBody>
        <FormFooter
          error={formRefusal}
          pending={pending}
          onCancel={() => onOpenChange(false)}
          confirmLabel={confirmLabel}
          confirmVariant={destructive ? "destructive" : "brand"}
        />
      </form>
    </ResponsiveDialog>
  );
}
