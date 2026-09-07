"use client";

import { useSyncExternalStore } from "react";
import { PHONE_QUERY } from "@/lib/breakpoint";

/**
 * Whether this is a phone, by the one line the whole app draws
 * (src/lib/breakpoint.ts). A media query read through `useSyncExternalStore`,
 * so the server and the browser's first render agree (both say "not a phone")
 * and the swap happens after hydration, while the thing that depends on it is
 * still closed and nothing is on screen to flicker.
 *
 * It lived inside the responsive dialog, and the company drawer wrote its own
 * copy one pixel apart (P11H, §5 #35). One hook, so the two cannot disagree.
 */
let query: MediaQueryList | null = null;
function media(): MediaQueryList {
  if (query === null) query = window.matchMedia(PHONE_QUERY);
  return query;
}
function subscribe(onChange: () => void): () => void {
  const list = media();
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}
const readWidth = () => media().matches;
const onTheServer = () => false;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, readWidth, onTheServer);
}
