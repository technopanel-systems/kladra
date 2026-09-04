"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the rail is collapsed to icons. Saved per browser, not per user (the
 * same reasoning as the theme cookie, SPEC D16) — a rep on a laptop and on a
 * shared desk machine want different widths.
 *
 * localStorage is an external store, so it is read through
 * `useSyncExternalStore` rather than copied into state by an effect: the
 * server snapshot is "expanded", the client snapshot is what was saved, and
 * another tab's change arrives through the `storage` event. The value is also
 * held in memory, so the toggle still works where storage is blocked — a
 * private window would otherwise read back the old answer and never move.
 */
const KEY = "kladra.sidebar";

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== KEY) return;
    cached = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readCollapsed(): boolean {
  if (cached === null) {
    try {
      cached = window.localStorage.getItem(KEY) === "collapsed";
    } catch {
      cached = false; // private mode or blocked storage: expanded is the default
    }
  }
  return cached;
}

function serverCollapsed(): boolean {
  return false;
}

function writeCollapsed(next: boolean): void {
  cached = next;
  try {
    window.localStorage.setItem(KEY, next ? "collapsed" : "expanded");
  } catch {
    // Nothing to persist to; the choice still applies to this browser session.
  }
  for (const onChange of listeners) onChange();
}

/**
 * True from the first frame AFTER hydration has painted. The stored width
 * cannot be known on the server, so the rail's first client render may change
 * its width; enabling the transition a frame later makes that a snap instead
 * of an unasked-for animation on every page load (DESIGN §2: motion where it
 * explains, never motion for its own sake).
 */
let painted = false;
function subscribePainted(onChange: () => void): () => void {
  const frame = requestAnimationFrame(() => {
    painted = true;
    onChange();
  });
  return () => cancelAnimationFrame(frame);
}
const readPainted = () => painted;
const serverPainted = () => false;

export type SidebarState = {
  collapsed: boolean;
  /** False until the first frame after hydration; gates the width transition. */
  ready: boolean;
  toggle: () => void;
};

export function useSidebar(): SidebarState {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, serverCollapsed);
  const ready = useSyncExternalStore(subscribePainted, readPainted, serverPainted);

  const toggle = useCallback(() => {
    writeCollapsed(!readCollapsed());
  }, []);

  return { collapsed, ready, toggle };
}
