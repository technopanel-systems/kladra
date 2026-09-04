"use client";

import { useEffect } from "react";

/**
 * Registers the offline splash worker (`public/sw.js`).
 *
 * Renders nothing. It is a component rather than an inline script so it lands
 * after hydration, on an idle browser, instead of competing with the first
 * screen a rep is waiting for.
 *
 * Registered in development too, deliberately. A service worker that only runs
 * in production is a service worker nobody sees until a customer does — and
 * this one cannot serve a stale build, because it caches no build: only a
 * splash, and only for a navigation that already failed. `tests/pwa.spec.ts`
 * cuts the network and watches it appear.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      // Nothing on screen: the app works without it, and a person cannot act
      // on a failed registration. The console is for whoever is looking.
      console.error("Kladra: the offline splash did not register", error);
    });
  }, []);

  return null;
}
