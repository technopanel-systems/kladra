"use client";

import { useEffect, useState } from "react";
import { formLookupsAction, type FormLookups } from "@/actions/forms";

/**
 * The dropdown lists the Add dialogs offer, fetched once and kept.
 *
 * Categories, lead sources, positions, countries and Saudi cities do not change
 * while a rep is adding companies, so the first dialog that opens pays for them
 * and every later one opens instantly. The cache is module scope — one per page
 * load, gone on the next navigation to a fresh document.
 *
 * Nothing is fetched until a dialog actually opens: a rep who never adds a
 * company never pays for the 249 countries.
 */

let cached: FormLookups | null = null;
let inFlight: Promise<FormLookups | null> | null = null;

function load(): Promise<FormLookups | null> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = formLookupsAction()
      .then((outcome) => {
        inFlight = null;
        // A failure is never cached — the next open tries again.
        if (!outcome.ok || !outcome.data) return null;
        cached = outcome.data;
        return cached;
      })
      .catch(() => {
        inFlight = null;
        return null;
      });
  }
  return inFlight;
}

export function useFormLookups(enabled: boolean): {
  lookups: FormLookups | null;
  failed: boolean;
} {
  const [lookups, setLookups] = useState<FormLookups | null>(cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || lookups) return;
    let cancelled = false;
    // Both states are set from the answer, never one synchronously before it:
    // a set in the effect body renders twice for nothing, and a retry that
    // succeeds clears `failed` here anyway.
    load().then((data) => {
      if (cancelled) return;
      if (data) setLookups(data);
      setFailed(data === null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, lookups]);

  return { lookups, failed };
}
