import * as React from "react"

import { westernFigure } from "@/lib/digits"
import { cn } from "@/lib/utils"

/** A box that asks for figures: its keyboard says so, or its type does. */
const FIGURES = new Set(["numeric", "decimal", "tel"]);

function Input({ className, type, onChange, ...props }: React.ComponentProps<"input">) {
  const figures = type === "tel" || FIGURES.has(props.inputMode ?? "");
  return (
    <input
      type={type}
      data-slot="input"
      // Folded as it is typed (src/lib/digits.ts): he sees the digits the app
      // writes, and the handler, the form and the action all receive them.
      onChange={
        figures
          ? (event) => {
              const input = event.currentTarget;
              const folded = westernFigure(input.value);
              if (folded !== input.value) {
                const caret = input.selectionStart;
                input.value = folded;
                if (caret !== null) input.setSelectionRange(caret, caret);
              }
              onChange?.(event);
            }
          : onChange
      }
      className={cn(
        "touch h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-hidden file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
