"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
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
 *
 * And that sentence lands under the answer, not only in a toast — the same rule
 * as PromptDialog: the field is where the eye is and where the fix has to
 * happen. A refusal about the act itself, with no field to point at, is written
 * in the footer, where the eye already is and the dialog stays open (DESIGN §8:
 * a refused submit goes in the footer) — it was a toast, which left the question
 * on screen with its answer somewhere else.
 *
 * Opened by its own trigger, or by the screen that hosts it (P13-G6): a row's or
 * a drawer's menu item is gone the moment the menu closes, so it cannot own a
 * trigger, and the screen passes `open` instead and hands focus back with
 * `useOpener`. `destructive` presses a button in the tint, never the brand, for
 * the act that takes something away.
 */
export function ConfirmDialog({
  trigger,
  open: hostedOpen,
  destructive = false,
  title,
  description,
  confirmLabel,
  successMessage,
  onConfirm,
  onDone,
  children,
  onOpenChange,
}: {
  /** What opens it. A confirmation a menu item asks has none; its screen passes `open`. */
  trigger?: ReactNode;
  /** Set by the screen that hosts it; left out, the dialog keeps its own. */
  open?: boolean;
  /** The act takes something away: the confirm button is in the tint. */
  destructive?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  onConfirm: () => Promise<ActionResult<unknown>>;
  /** Runs after a confirmed action succeeds — refresh, or navigate away. */
  onDone?: () => void;
  /** The question this confirmation also has to ask, between text and buttons. */
  children?: ReactNode;
  /** So a caller can clear what it asked when the dialog closes — and, hosted, close it. */
  onOpenChange?: (open: boolean) => void;
}) {
  const guarded = useWireGuard();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = hostedOpen ?? ownOpen;
  const [refusal, setRefusal] = useState<string | null>(null);
  const [formRefusal, setFormRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      // Guarded: no answer at all is a refusal too, not the error card (D132).
      const result = await guarded(onConfirm)();
      if (!result.ok) {
        const atField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : null;
        setRefusal(atField ?? null);
        setFormRefusal(atField ? null : result.error);
        return;
      }
      toast.success(successMessage);
      change(false);
      onDone?.();
    });
  }

  function change(next: boolean) {
    if (hostedOpen === undefined) setOwnOpen(next);
    setRefusal(null);
    setFormRefusal(null);
    onOpenChange?.(next);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) change(next);
      }}
      trigger={trigger}
      title={title}
      description={description}
    >
      {/* A form, so Enter confirms it (D114). It stops at itself: a
          confirmation opened from inside another form must not submit that
          one too — React carries a submit through a portal to the tree above. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) confirm();
        }}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        {children || refusal ? (
          <FormBody>
            {children}
            {refusal ? (
              <p role="alert" className="text-xs text-destructive">
                {refusal}
              </p>
            ) : null}
          </FormBody>
        ) : null}
        <FormFooter
          error={formRefusal}
          pending={pending}
          onCancel={() => change(false)}
          confirmLabel={confirmLabel}
          confirmVariant={destructive ? "destructive" : "brand"}
        />
      </form>
    </ResponsiveDialog>
  );
}
