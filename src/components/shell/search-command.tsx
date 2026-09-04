"use client";

import { Building2, FileText, FolderKanban, Search, UserRound } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { searchAllAction, type SearchResults } from "@/actions/search";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { formatPhone } from "@/lib/phone";

/**
 * The search trigger and the palette behind it. Ctrl+K / Cmd+K opens it from
 * any screen (SPEC §3); the trigger looks like an input because that is what a
 * rep reaches for. Matching happens in the server action, so cmdk's own
 * filtering is off — it would re-filter five already-chosen rows.
 *
 * A hit navigates to `?open=<id>` on the list screen; P3 reads that and opens
 * the drawer, which is how the open record stays in the URL (SPEC §3).
 */

const EMPTY: SearchResults = {
  companies: [],
  contacts: [],
  projects: [],
  quotations: [],
};
const DEBOUNCE_MS = 200;
const MIN_TERM = 2;

/** Results always carry the term they answer, so a stale reply is recognisable. */
type Answer = { query: string; results: SearchResults };

function isEmpty(results: SearchResults): boolean {
  return (
    results.companies.length === 0 &&
    results.contacts.length === 0 &&
    results.projects.length === 0 &&
    results.quotations.length === 0
  );
}

// The keycap is a platform fact, not React state: read once, never changes.
const neverChanges = () => () => {};
let macCache: boolean | null = null;
function isMac(): boolean {
  if (macCache === null) macCache = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  return macCache;
}
const notMac = () => false;

export function SearchCommand() {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const mac = useSyncExternalStore(neverChanges, isMac, notMac);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const query = term.trim();
    if (!open || query.length < MIN_TERM) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const outcome = await searchAllAction(query);
      if (cancelled) return;
      setAnswer({
        query,
        results: outcome.ok && outcome.data ? outcome.data : EMPTY,
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setTerm("");
  }

  function go(href: string) {
    setOpen(false);
    setTerm("");
    router.push(href);
  }

  // What to show is derived, so nothing has to be cleared as the term changes:
  // the last answer stays on screen while the next one is on its way.
  const query = term.trim();
  const results = answer?.results ?? null;
  const stale = answer === null || answer.query !== query;
  const showHint = query.length < MIN_TERM;
  const showLoading = !showHint && (results === null || (isEmpty(results) && stale));
  const showNothing = !showHint && !showLoading && results !== null && isEmpty(results);
  const rows = showHint || showLoading || results === null ? EMPTY : results;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground sm:max-w-md md:h-9 lg:max-w-lg"
      >
        <Search className="size-4 shrink-0" />
        {/* The long sentence is what the input under it is for; on the button
            it only appears where the button is wide enough to hold it whole.
            At 768 it used to be cut off mid-word in both languages — a label
            that stops in the middle reads as a fault, not as an abbreviation. */}
        <span data-slot="search-label" className="flex-1 truncate text-start text-[13px] lg:hidden">
          {t("common.search")}
        </span>
        <span
          data-slot="search-label"
          className="hidden flex-1 truncate text-start text-[13px] lg:inline"
        >
          {t("common.searchPlaceholder")}
        </span>
        {/* The keycap is decoration; without this it joins the button's name.
            Key names are Latin on an Arabic keyboard too, so it is not
            translated — but it needs dir="ltr" or bidi reorders "Ctrl K" in an
            RTL line. It is an inline element, never a layout container. */}
        <kbd
          aria-hidden="true"
          dir="ltr"
          className="num hidden shrink-0 items-center rounded border border-line px-1.5 py-0.5 text-[10px] text-faint lg:inline-flex"
        >
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {/*
       * Dialog rather than shadcn's CommandDialog: that one renders its
       * sr-only header outside DialogContent, so "Search Kladra" sat in every
       * page's heading outline even with the palette shut.
       */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-1/3 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("shell.searchDialog")}</DialogTitle>
            <DialogDescription>{t("shell.searchHint")}</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              value={term}
              onValueChange={setTerm}
              placeholder={t("common.searchPlaceholder")}
            />
            <CommandList>
              {showHint ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("shell.searchHint")}
                </p>
              ) : null}
              {showLoading ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("common.loading")}
                </p>
              ) : null}
              {showNothing ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("shell.searchNoResults", { q: query })}
                </p>
              ) : null}

              {rows.companies.length > 0 ? (
                <CommandGroup heading={t("common.companies")}>
                  {rows.companies.map((row) => (
                    <CommandItem
                      key={row.id}
                      value={`company-${row.id}`}
                      onSelect={() => go(`/companies?open=${row.id}`)}
                    >
                      <Building2 className="text-muted-foreground" />
                      <span className="truncate">{row.name}</span>
                      {row.city ? (
                        <CommandShortcut className="max-w-[40%] truncate tracking-normal">
                          {row.city}
                        </CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {rows.contacts.length > 0 ? (
                <CommandGroup heading={t("common.contacts")}>
                  {rows.contacts.map((row) => (
                    <CommandItem
                      key={row.id}
                      value={`contact-${row.id}`}
                      onSelect={() => go(`/companies?open=${row.companyId}`)}
                    >
                      <UserRound className="text-muted-foreground" />
                      <span className="truncate">{row.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.companyName}
                      </span>
                      <CommandShortcut className="tracking-normal">
                        <span dir="ltr" className="num">
                          {formatPhone(row.phone)}
                        </span>
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {rows.projects.length > 0 ? (
                <CommandGroup heading={t("common.projects")}>
                  {rows.projects.map((row) => (
                    <CommandItem
                      key={row.id}
                      value={`project-${row.id}`}
                      onSelect={() => go(`/projects?open=${row.id}`)}
                    >
                      <FolderKanban className="text-muted-foreground" />
                      <span className="truncate">{row.name}</span>
                      <CommandShortcut className="max-w-[40%] truncate tracking-normal">
                        {row.companyName}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {rows.quotations.length > 0 ? (
                <CommandGroup heading={t("common.quotations")}>
                  {rows.quotations.map((row) => (
                    <CommandItem
                      key={row.id}
                      value={`quotation-${row.id}`}
                      onSelect={() => go(`/quotations?open=${row.id}`)}
                    >
                      <FileText className="text-muted-foreground" />
                      <span className="num truncate">{row.number}</span>
                      <CommandShortcut className="max-w-[40%] truncate tracking-normal">
                        {row.companyName}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
