"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * The two halves every form dialog is made of: the part that scrolls, and the
 * bar at the bottom that does not.
 *
 * They were written out four times, identically, and the reason to name them is
 * the `min-h-0 flex-1` on the scroller. Without it the body sizes to its own
 * content instead of to the space left over, the footer stops being the last
 * thing and lands on top of the final field — reported as "the Save bar covers
 * Email". One copy of that, not four (DESIGN §5).
 */
export function FormBody({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="form-body"
      // `scroll-hint` is the second thing this file exists for: a form with
      // more below the fold looked exactly like one that ended there, because
      // the overlay scrollbar fades and the footer stays visible above the part
      // nobody could see. Four backgrounds, no JavaScript, on every dialog in
      // the app at once (D80, globals.css).
      // `scroller` is the overflow AND the rule that comes with it: a flex
      // column shrinks its children before it scrolls, and a card carries
      // `overflow: hidden`, so the totals block here was squeezed to 26px at
      // 375 and silently ate three of its four rows (globals.css, DESIGN §5).
      className="scroll-hint scroller flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4"
    >
      {children}
    </div>
  );
}

/**
 * Cancel and Save, with room above them for the one thing that went wrong with
 * the form as a whole.
 *
 * `error` is only ever the whole-form answer — "this company is archived", "that
 * number is already here". Anything about a single field is shown at that field
 * instead, which is where the person is looking.
 */
export function FormFooter({
  error,
  pending,
  onCancel,
}: {
  error?: string | null;
  pending: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("common");

  return (
    <div data-slot="form-footer" className="border-t border-line bg-surface-2 p-4">
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          disabled={pending}
          variant="brand"
        >
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
