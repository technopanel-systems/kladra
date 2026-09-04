"use client";

import * as React from "react";

/** React's marker for a lazily-resolved element. */
const REACT_LAZY = Symbol.for("react.lazy");

/**
 * Resolves a trigger's child when it came from a Server Component.
 *
 * A `<Button>` built in a server component and handed to a client component as
 * a prop does not arrive as an element. It arrives as a lazy wrapper around a
 * streamed chunk, and Radix's `asChild` slot throws on it outright:
 *
 *     Primitive.button failed to slot onto its children.
 *     Expected a single React element child or `Slottable`.
 *
 * The whole drawer then goes to the error boundary — "This page couldn't load"
 * — from clicking a tab. It was live in the company drawer's projects tab, and
 * the same shape was waiting in five other places, because handing the drawer's
 * own wording to a dialog is the obvious way to write it.
 *
 * So every trigger in this kit resolves the child before Radix sees it. The
 * fix belongs here rather than at the six call sites: the next drawer would
 * make the same mistake, and it fails at runtime, in one locale, on one tab.
 *
 * Not a workaround for a slow chunk — the wrapper is how a server element
 * always crosses the boundary, resolved or not. `use` suspends if it is still
 * arriving, which is what the drawer's Suspense boundary is for.
 */
export function useSlotChild(children: React.ReactNode): React.ReactNode {
  const lazy = children as { $$typeof?: symbol; _payload?: unknown } | null | undefined;
  if (lazy && typeof lazy === "object" && lazy.$$typeof === REACT_LAZY) {
    return React.use(lazy._payload as Promise<React.ReactNode>);
  }
  return children;
}
