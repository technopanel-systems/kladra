"use client";

import { Loader2, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Search that filters as you type. The term lives in `?q=` (SPEC §3), written
 * a quarter of a second after the last keystroke so a five-letter name is one
 * query, not five.
 *
 * `replace` rather than `push`: every keystroke as a history entry turns Back
 * into a slow re-typing of what you just deleted. One Back leaves the search.
 *
 * The input is uncontrolled by the URL — it holds its own text and is never
 * re-mounted — so a re-render mid-word neither steals the caret nor drops a
 * letter. `typed` keeps the effect from pushing a term the user did not type:
 * without it, going Back would change `q` under a still-mounted input and the
 * effect would immediately push the old term again.
 */

const DEBOUNCE_MS = 250;

export function ListSearch({
  q,
  filter,
  open,
}: {
  q: string;
  filter: string | null;
  open: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [term, setTerm] = useState(q);
  const [pending, startTransition] = useTransition();

  // next-intl's useRouter returns a fresh object each render; a ref is what
  // stops the debounce effect from restarting — and so never firing.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => {
      typed.current = false;
      const params = new URLSearchParams();
      const trimmed = term.trim();
      if (trimmed) params.set("q", trimmed);
      if (filter) params.set("filter", filter);
      if (open) params.set("open", open);
      const query = params.toString();
      startTransition(() => {
        routerRef.current.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, filter, open, pathname]);

  function change(value: string) {
    typed.current = true;
    setTerm(value);
  }

  return (
    <div role="search" className="relative w-full sm:max-w-sm">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={term}
        onChange={(event) => change(event.target.value)}
        placeholder={t("companies.searchPlaceholder")}
        aria-label={t("companies.searchLabel")}
        aria-busy={pending || undefined}
        autoComplete="off"
        className="h-9 ps-8 pe-8 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {pending ? (
        // aria-busy on the input already carries the state; a second
        // announcement on every pause in typing is noise.
        <Loader2
          aria-hidden="true"
          className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : term ? (
        <button
          type="button"
          onClick={() => change("")}
          aria-label={t("companies.clearSearch")}
          className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
