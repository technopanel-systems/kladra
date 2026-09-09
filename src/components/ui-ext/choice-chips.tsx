"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * A short, closed list of answers, drawn as chips (P12-10).
 *
 * The log dialog has drawn this since P4 — native radios inside a fieldset,
 * each one a chip that is the label around a visually hidden input, so arrow
 * keys, grouping and the announced state come free and the whole chip is the
 * 44px target a thumb presses (D130). The payment terms are the second and
 * third list of the same shape, and four hand-drawn search boxes taught this
 * app what happens next (§5 #143): it is one component before the third copy
 * exists, not after the fourth.
 *
 * The chosen chip is a quiet fill, never a state colour: the five colours mean
 * what happened to a record, and painting the selected one green spends the
 * loudest thing on screen on "you pressed this" (DESIGN §6).
 *
 * `name` makes these real form controls, so the answer posts with the form and
 * no hidden input mirrors it. A group that is not rendered posts nothing, which
 * is exactly what a second question that does not apply should do.
 */
export type Choice<T extends string> = {
  value: T;
  label: string;
  Icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
};

export function ChoiceChips<T extends string>({
  legend,
  name,
  value,
  choices,
  onChange,
  disabled,
  error,
  errorId,
}: {
  legend: string;
  /** The form field these post as. */
  name: string;
  value: T | "";
  choices: readonly Choice<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  error?: string;
  errorId?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map(({ value: option, label, Icon }) => (
          <label
            key={option}
            className={cn(
              // `touch`: the label is the control, and not a kit one (D130).
              "touch inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              value === option
                ? "border-line-strong bg-secondary font-medium text-foreground"
                : "border-line bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              aria-describedby={error && errorId ? errorId : undefined}
              className="sr-only"
            />
            {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
            {label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
