"use client";

import { useEffect } from "react";

/**
 * Marks the document once React has taken over the server-rendered HTML.
 *
 * A screen is on the page and readable well before it is live. Anything pressed
 * in between does nothing at all — no error, no dialog, no complaint — and it is
 * the fast pages that lose the race, because they paint sooner. That is not a
 * problem a person hits often, but it is one a test hits constantly, and a suite
 * that fails once every few runs stops being read.
 *
 * `html[data-hydrated]` is what the specs wait for after a page load
 * (tests/helpers/i18n.ts). It is set once and stays: a soft navigation keeps the
 * root mounted, so it is still true on the other side.
 */
export function Hydrated() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
