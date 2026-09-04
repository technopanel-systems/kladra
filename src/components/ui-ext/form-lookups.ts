"use client";

import { useEffect, useState } from "react";
import { formLookupsAction, quotationLookupsAction } from "@/actions/forms";
import type { FormLookups, QuotationLookups } from "@/actions/forms";
import type { ActionResult } from "@/lib/types";

/**
 * The dropdown lists a dialog offers, fetched once and kept.
 *
 * Categories, lead sources, positions, countries, Saudi cities, suppliers,
 * classes, fire ratings and thicknesses do not change while somebody is filling
 * a form in, so the first dialog that opens pays for them and every later one
 * opens instantly. The cache is module scope — one per page load, gone on the
 * next navigation to a fresh document.
 *
 * Nothing is fetched until a dialog actually opens: a rep who never adds a
 * company never pays for the 249 countries.
 *
 * One loader, two lists. The company lists and the quotation lists have nothing
 * to do with each other, but "fetch once, never cache a failure, do not fetch
 * until asked" is one rule, and two copies of it is how one of them quietly
 * starts caching an error.
 */

type Loader<T> = { get: () => Promise<T | null> };

function loaderFor<T>(action: () => Promise<ActionResult<T>>): Loader<T> {
  let cached: T | null = null;
  let inFlight: Promise<T | null> | null = null;

  return {
    get() {
      if (cached) return Promise.resolve(cached);
      if (!inFlight) {
        inFlight = action()
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
    },
  };
}

const formLoader = loaderFor(formLookupsAction);
const quotationLoader = loaderFor(quotationLookupsAction);

function useLookups<T>(loader: Loader<T>, enabled: boolean): { lookups: T | null; failed: boolean } {
  const [lookups, setLookups] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || lookups) return;
    let cancelled = false;
    // Both states are set from the answer, never one synchronously before it:
    // a set in the effect body renders twice for nothing, and a retry that
    // succeeds clears `failed` here anyway.
    loader.get().then((data) => {
      if (cancelled) return;
      if (data) setLookups(data);
      setFailed(data === null);
    });
    return () => {
      cancelled = true;
    };
  }, [loader, enabled, lookups]);

  return { lookups, failed };
}

/** Everything the Add and Edit company/contact dialogs offer. */
export function useFormLookups(enabled: boolean): {
  lookups: FormLookups | null;
  failed: boolean;
} {
  return useLookups(formLoader, enabled);
}

/** Supplier, class, fire rating and thickness — a quotation line's four lists. */
export function useQuotationLookups(enabled: boolean): {
  lookups: QuotationLookups | null;
  failed: boolean;
} {
  return useLookups(quotationLoader, enabled);
}
