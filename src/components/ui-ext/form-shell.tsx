"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      className="scroll-hint scroller flex min-h-0 flex-1 flex-col gap-4 px-4 pt-2 pb-4"
    >
      {children}
    </div>
  );
}

/**
 * A part of a long form with a name: a small word over what it holds, a sentence
 * under the word when the part needs one, and the part's own action at the
 * word's end — Add service beside Services (DESIGN §8, the labelled group).
 *
 * A request dialog is a paper of parts — who it is for, the panels, the services,
 * what it comes to, the terms — and it read as one column of boxes because
 * nothing but a 13.5px label in the boxes' own weight said where one part ended.
 */
export function FormSection({
  title,
  hint,
  action,
  children,
  className,
  ...props
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  "data-slot"?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-3", className)} {...props}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={id} className="text-base font-semibold">
            {title}
          </h3>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A paper's form on a desk: the parts in the main column, and what it comes to
 * beside them, held in view while the column scrolls under it — the way an
 * order's summary stays beside its lines. Below `xl` the aside follows the main
 * column, and `FormFooter`'s `summary` keeps the headline figures over Save.
 */
export function FormSplit({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      <aside data-slot="form-aside" className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-0">
        {aside}
      </aside>
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
  confirmLabel,
  confirmVariant = "brand",
  summary,
}: {
  error?: string | null;
  pending: boolean;
  onCancel: () => void;
  /** The verb on the primary button when it is not Save — "Archive", "Issue", "Mark lost". */
  confirmLabel?: string;
  /** Destructive when the verb takes something off the floor. */
  confirmVariant?: "brand" | "destructive";
  /**
   * What the form comes to, kept in sight over Save where the form's own figures
   * have scrolled away — below `xl`, where a paper's totals sit under its items
   * rather than beside them (`FormSplit`). The m² first: it is the headline.
   */
  summary?: ReactNode;
}) {
  const t = useTranslations("common");

  return (
    <div
      data-slot="form-footer"
      // The bottom padding is the home indicator's when there is one: on a
      // phone this bar is the lowest thing on the screen (D129).
      className="border-t border-line bg-surface-2 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {summary ? (
        <div data-slot="form-summary" className="mb-3 flex items-baseline justify-between gap-4 text-sm xl:hidden">
          {summary}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {/* Stacked on a phone with the primary LOWEST — the thumb rests at the
          bottom of a sheet, and the kit's reverse order put Cancel there
          (DESIGN §2, D129). From md they sit in a row, Save at the inline end. */}
      <div className="flex flex-col gap-2 md:flex-row md:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending} variant={confirmVariant}>
          {pending ? t("saving") : (confirmLabel ?? t("save"))}
        </Button>
      </div>
    </div>
  );
}
