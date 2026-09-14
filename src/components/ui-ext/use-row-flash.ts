"use client";

import { useCallback, useEffect, useState, type AnimationEvent } from "react";

/** How long a mark waits for its row to be drawn before it is forgotten. */
const MARK_WAITS_MS = 10_000;

const NO_MARKS: ReadonlySet<string> = new Set<string>();

/**
 * The arrived flash on the row the admin's own save changed (DESIGN §2, §8: a
 * success is a toast that names it AND the row that changed).
 *
 * The live channel flashes what somebody ELSE touched; nothing flashed what the
 * admin had just done, so after "Saved." he hunted for the row. The mark is
 * keyed on what the form knew — an id, an email, a day — because the actions
 * hand back no row, and it is cleared when the row's own animation ends, so the
 * two seconds start when the refreshed row is on screen (D105), not when the
 * answer came.
 */
export function useRowFlash(): {
  flash: (keys: string[]) => void;
  /** Spread on the row: the class while marked, and the end of its animation. */
  flashOf: (key: string) => {
    className: string | undefined;
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void;
  };
} {
  const [marks, setMarks] = useState<ReadonlySet<string>>(NO_MARKS);

  const flash = useCallback((keys: string[]) => setMarks(new Set(keys)), []);

  useEffect(() => {
    if (marks.size === 0) return;
    const timer = setTimeout(() => setMarks(NO_MARKS), MARK_WAITS_MS);
    return () => clearTimeout(timer);
  }, [marks]);

  const flashOf = useCallback(
    (key: string) => ({
      className: marks.has(key) ? "row-arrived" : undefined,
      onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
        // Only the row's own flash: a mark inside it animates too, and bubbles.
        if (event.target !== event.currentTarget || !marks.has(key)) return;
        setMarks((current) => {
          const rest = new Set(current);
          rest.delete(key);
          return rest;
        });
      },
    }),
    [marks],
  );

  return { flash, flashOf };
}
