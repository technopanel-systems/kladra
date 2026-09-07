"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SIDEBAR_COOKIE, sidebarCollapsed } from "@/lib/sidebar";

/**
 * Whether the rail is collapsed to icons. Saved per browser, not per user (the
 * same reasoning as the theme cookie, SPEC D16) — a rep on a laptop and on a
 * shared desk machine want different widths.
 *
 * The cookie is an external store, so it is read through `useSyncExternalStore`
 * rather than copied into state by an effect. The server snapshot is what the
 * layout read from the request, so the first paint is already the saved width
 * and hydration has nothing to correct. It was localStorage, which the server
 * cannot see, and every load of a collapsed rail began with an expanded one
 * that snapped shut a frame later (§5 #40). The value is also held in memory,
 * and every touch of `document.cookie` is guarded, so the toggle still works
 * where cookies are refused — for this page's lifetime, at least — and a
 * refusal can never throw inside a render and take the shell down with it.
 *
 * A cookie has no change event, so another tab's toggle is not pushed here the
 * way a `storage` event used to push it; it is read again whenever this tab
 * comes back into focus, which is the moment anybody would notice.
 */
const YEAR = 60 * 60 * 24 * 365;

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onFocus = () => {
    cached = null;
    onChange();
  };
  window.addEventListener("focus", onFocus);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("focus", onFocus);
  };
}

function readCookie(): string | undefined {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE}=([^;]*)`));
    return match?.[1];
  } catch {
    return undefined; // cookies refused: expanded is the default
  }
}

function readCollapsed(): boolean {
  if (cached === null) cached = sidebarCollapsed(readCookie());
  return cached;
}

function writeCollapsed(next: boolean): void {
  cached = next;
  try {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie =
      `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${YEAR}; ` +
      `samesite=lax${secure}`;
  } catch {
    // Nothing to persist to; the choice still applies to this page.
  }
  for (const onChange of listeners) onChange();
}

export type SidebarState = {
  collapsed: boolean;
  toggle: () => void;
};

/** `initial` is what the server read from the cookie: the width of the first paint. */
export function useSidebar(initial: boolean): SidebarState {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => initial);

  const toggle = useCallback(() => {
    writeCollapsed(!readCollapsed());
  }, []);

  return { collapsed, toggle };
}
