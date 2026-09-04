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
 * another tab's change arrives through the `storage` event.
 */
const KEY = "kladra.sidebar";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "collapsed";
  } catch {
    // Private mode or blocked storage: expanded is the safe default.
    return false;
  }
}

function serverCollapsed(): boolean {
  return false;
}

function writeCollapsed(next: boolean): void {
  try {
    window.localStorage.setItem(KEY, next ? "collapsed" : "expanded");
  } catch {
    // Nothing to persist to; the choice still applies to this page.
  }
  for (const onChange of listeners) onChange();
}

const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

export type SidebarState = {
  collapsed: boolean;
  /** False for the first paint, when the stored width is not knowable yet. */
  ready: boolean;
  toggle: () => void;
};

export function useSidebar(): SidebarState {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, serverCollapsed);
  // Gating the width transition on this makes the first paint a snap rather
  // than an animation of the rail moving on its own.
  const ready = useSyncExternalStore(neverChanges, onClient, onServer);

  const toggle = useCallback(() => {
    writeCollapsed(!readCollapsed());
  }, []);

  return { collapsed, ready, toggle };
}
