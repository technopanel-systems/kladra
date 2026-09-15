"use client";

import { Trash2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * One item of a paper as a rep fills it in — a quotation's panel line, a load's
 * line — drawn as an item and not as a row of a spreadsheet (founder,
 * 2026-09-15, the third report of "a stock form").
 *
 * What made the request dialogs read as a grid was the grid: thirteen columns
 * under one row of names, every label hidden, nine boxes of one weight in a line
 * with nothing to say which of them belong together, and the line's m² one more
 * cell among them. An item here is a card. Its head says which item it is and
 * what it comes to — its m² as the figure, its money beside it, quieter — and its
 * boxes sit in rows that each answer one question, every box under its own label
 * at every width. One shape from 375 to 1366, so a label, an id and a locator mean
 * the same thing everywhere and there is no second layout to drift.
 */
export function LineItem({
  heading,
  figures,
  onRemove,
  removeLabel,
  disabled,
  alert,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  /** "Item 3": what the rep calls it, and what a screen reader hears. */
  heading: ReactNode;
  /** What the item comes to, at the head's end: `LineFigure`s. */
  figures?: ReactNode;
  /** Absent where the item cannot go — the only line of a paper (DESIGN §5: no dead control). */
  onRemove?: () => void;
  removeLabel: string;
  disabled?: boolean;
  /** The one sentence about this item — refused, or more than is left — under its boxes (D43). */
  alert?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div {...props} className={cn("card-face flex flex-col", className)}>
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-1.5 ps-3 pe-1.5">
        <h4 className="me-auto text-sm font-medium">{heading}</h4>
        {figures ? <div className="flex items-baseline gap-x-4">{figures}</div> : null}
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={onRemove}
            aria-label={removeLabel}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : (
          // The same room as the button, so an only item's figures end where a
          // second item's do.
          <span aria-hidden="true" className="size-8" />
        )}
      </div>
      <div className="flex flex-col gap-3 p-3">
        {children}
        {alert}
      </div>
    </div>
  );
}

/**
 * A row of an item's boxes that answers one question — what the panel is; how
 * many, on what sheet, at what price. Two across on a phone; on a desk the row's
 * own count, so a row of four and a row of five each fill the card.
 *
 * A row after the first is set off by a hairline: two groups, said by the layout
 * rather than by a caption nobody reads.
 */
export function LineFields({
  cols,
  children,
  className,
}: {
  cols: 4 | 5;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 items-start gap-3 [&+&]:border-t [&+&]:border-line [&+&]:pt-3",
        cols === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One box and its label, the label always drawn. A box a searchable select owns
 * is labelled by id (`labelId`); an input by `htmlFor`. `hint` is a line under the
 * box that belongs to it — what is left to send on a load.
 */
export function LineField({
  label,
  htmlFor,
  labelId,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  labelId?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} id={labelId} className="leading-snug">
        {label}
      </Label>
      {children}
      {hint}
    </div>
  );
}

/**
 * A figure an item comes to. `strong` is the headline — the m², which is what a
 * rep is measured in (S43) — and the money beside it is the support. The unit is
 * written after the figure, quieter, in the reader's words; the digits run
 * left to right whatever the page does (DESIGN §5).
 */
export function LineFigure({
  value,
  unit,
  strong,
  slot,
  label,
}: {
  value: string;
  unit: string;
  strong?: boolean;
  slot?: string;
  /** What the figure is, for a screen reader, where its unit alone does not say: "Line total". */
  label?: string;
}) {
  return (
    <span className={cn("whitespace-nowrap", strong ? "text-base" : "text-sm")}>
      {label ? <span className="sr-only">{label} </span> : null}
      <span dir="ltr" data-slot={slot} className={cn("num text-foreground", strong ? "font-semibold" : "font-medium")}>
        {value}
      </span>{" "}
      <span className="text-xs text-muted-foreground">{unit}</span>
    </span>
  );
}
