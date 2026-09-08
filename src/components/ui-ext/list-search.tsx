"use client";

import { Loader2, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The one search box. Every list screen has one and they were four different
 * ones (P11J, §5 #121): the companies screen had this component, and the
 * projects, quotations and dispatches tables each drew their own inside
 * themselves — same debounce, same clear, same three bugs to fix three times.
 * The worst of them was on the coordinator's desk, where the queue renders two
 * of those tables: two boxes, both writing `?q=`, each also writing its own
 * `?status=` over the other's, and the second one showing empty while the list
 * under it was already filtered, because a box that holds its own text never
 * heard what the first one typed.
 *
 * Search that filters as you type. The term lives in `?q=` (SPEC §3), written
 * a quarter of a second after the last keystroke so a five-letter name is one
 * query, not five.
 *
 * `replace` rather than `push`: every keystroke as a history entry turns Back
 * into a slow re-typing of what you just deleted. One Back leaves the search.
 *
 * The input holds its own text and is never re-mounted, so a re-render mid-word
 * neither steals the caret nor drops a letter; `typing` keeps the effect from
 * pushing a term the user did not type. But it does follow the URL when
 * something ELSE moves it — Back, or a Clear on an empty list — and that is the
 * render-phase adjustment below rather than an effect, because an effect that
 * sets state is a second render the user can see (and the lint refuses it).
 */

const DEBOUNCE_MS = 250;

export function ListSearch({
  q,
  keep,
  label,
  placeholder,
  clearLabel,
  className,
}: {
  /** The term the list is actually filtered by, from the URL. */
  q: string;
  /**
   * What the screen is standing on and must keep as the term changes — a
   * filter, a whose-floor. Empty values are left off. What a NEW search drops
   * is decided by leaving it out: the row a screen had open may not survive the
   * search that follows it.
   */
  keep?: Record<string, string | null | undefined>;
  label: string;
  placeholder: string;
  clearLabel: string;
  className?: string;
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

  // Whether the text in the box is on its way to the URL. State, not a ref: it
  // is read while rendering, to decide whether a URL that moved was this box's
  // doing or somebody else's.
  const [typing, setTyping] = useState(false);

  // The URL moved and it was not this box — Back, or a Clear on an empty list:
  // follow it. Adjusting during render rather than in an effect, so there is no
  // second render with the old text in it.
  const [seen, setSeen] = useState(q);
  if (seen !== q) {
    setSeen(q);
    if (!typing) setTerm(q);
  }

  const kept = JSON.stringify(keep ?? {});
  useEffect(() => {
    if (!typing) return;
    const timer = setTimeout(() => {
      setTyping(false);
      const params = new URLSearchParams();
      const trimmed = term.trim();
      if (trimmed) params.set("q", trimmed);
      for (const [key, value] of Object.entries(JSON.parse(kept) as Record<string, unknown>)) {
        if (typeof value === "string" && value) params.set(key, value);
      }
      const query = params.toString();
      startTransition(() => {
        routerRef.current.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, typing, kept, pathname]);

  function change(value: string) {
    setTyping(true);
    setTerm(value);
  }

  return (
    <div role="search" className={cn("relative w-full sm:max-w-sm", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={term}
        onChange={(event) => change(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        aria-busy={pending || undefined}
        autoComplete="off"
        className="h-9 ps-8 pe-8 max-md:pe-11 [&::-webkit-search-cancel-button]:appearance-none"
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
          aria-label={clearLabel || t("common.clear")}
          className="touch absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 max-md:end-0"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
