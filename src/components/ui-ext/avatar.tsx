import { avatarTint, initialsOf } from "@/lib/avatar";
import type { StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * A person or a company, drawn the one way (DESIGN §1b).
 *
 * Round for a person, a rounded square for a company — the shape says which
 * before the letters do. 24 in a row, 32 in a card, 40 at the head of a drawer.
 *
 * `ring` is drawn only where a state exists, in that state's colour, and never
 * alone: the word for the state is on the screen beside it, because a ring is
 * the one part of this a reader with deuteranopia cannot see. So the avatar
 * itself is `aria-hidden` — the name it stands for is always written next to
 * it or in the label of the control it sits in, and a screen reader hearing
 * "F H" before "Faisal Al-Harbi" is hearing the same thing twice.
 */

export type AvatarKind = "person" | "company";
export type AvatarSize = "sm" | "md" | "lg";

const SIZE: Record<AvatarSize, string> = {
  sm: "size-6 text-[0.625rem]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
};

const RING: Record<StateTone, string> = {
  wait: "ring-state-wait-fg",
  open: "ring-state-open-fg",
  good: "ring-state-good-fg",
  bad: "ring-state-bad-fg",
  over: "ring-state-over-fg",
};

export function Avatar({
  id,
  name,
  kind = "person",
  size = "md",
  ring,
  className,
}: {
  /** The record's own id: the colour follows the record, not its name. */
  id: string;
  /** In the reader's script (D68). */
  name: string;
  kind?: AvatarKind;
  size?: AvatarSize;
  ring?: StateTone;
  className?: string;
}) {
  const tint = avatarTint(id);
  return (
    <span
      aria-hidden="true"
      data-slot="avatar"
      data-tint={tint}
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none font-medium select-none",
        "bg-(--avatar-bg) text-(--avatar-fg)",
        kind === "person" ? "rounded-full" : "rounded-md",
        SIZE[size],
        ring && ["ring-2 ring-offset-2 ring-offset-background", RING[ring]],
        className,
      )}
      style={
        {
          "--avatar-bg": `var(--avatar-${tint}-bg)`,
          "--avatar-fg": `var(--avatar-${tint}-fg)`,
        } as React.CSSProperties
      }
    >
      {initialsOf(name)}
    </span>
  );
}
