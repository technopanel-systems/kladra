"use client";

import { Building2, FileText, FolderKanban, Loader2, Search, Truck, UserRound } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { recentRecordsAction, searchAllAction, type SearchResults } from "@/actions/search";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Empty } from "@/components/ui-ext/empty";
import { Ref } from "@/components/ui-ext/figures";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useRouter } from "@/i18n/navigation";
import type { PaletteCompany, PalettePaper, RecentRecords } from "@/lib/palette";
import { formatPhone } from "@/lib/phone";
import type { ActionResult, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The search trigger and the palette behind it. Ctrl+K / Cmd+K opens it from
 * any screen (SPEC §3); the trigger looks like an input because that is what a
 * rep reaches for. Matching happens in the server action, so cmdk's own
 * filtering is off — it would re-filter five already-chosen rows.
 *
 * A hit navigates to `?open=<id>` on the list screen; P3 reads that and opens
 * the drawer, which is how the open record stays in the URL (SPEC §3).
 *
 * It never opens to a blank box (lists-navigation). Before two letters are
 * typed it says what it searches, and under that the records this person was
 * most recently busy with, drawn exactly as results are — the companies of his
 * latest reports, the papers he last raised or was answered on
 * (`src/lib/palette.ts`). Every state the box can reach is drawn: the shape of
 * the rows while an answer is out, the words the server sent when it could not
 * answer, one sentence and the way out when nothing matched, and a line when a
 * group was cut short.
 */

/**
 * Where a company hit goes.
 *
 * Everybody who holds a floor or oversees one opens the company itself. The
 * coordinator is shown every company by name and may open only her own: the
 * palette used to land her on an empty list with a sheet over it saying the
 * company she had just read the name of "is no longer available" (D139). What
 * she wants somebody else's company for is what we have quoted them, and that
 * screen is hers, shows every rep's quotations and searches company name first.
 *
 * Since SPEC §3 she has customers of her own, so the answer is no longer about
 * her role alone: a company on her own floor opens in the drawer like anybody's,
 * and it is the row that says which this is, because the palette cannot ask.
 */
function companyHref(role: Role, id: string, name: string, mine: boolean): string {
  return role === "coordinator" && !mine
    ? `/quotations?q=${encodeURIComponent(name)}`
    : `/companies?open=${id}`;
}

const DEBOUNCE_MS = 200;
const MIN_TERM = 2;

/** An answer carries the question it answers, so a stale reply is recognisable. */
type Answer<T> = { key: string; outcome: ActionResult<T> };

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

export function SearchCommand({ role }: { role: Role }) {
  const t = useTranslations();
  const guarded = useWireGuard();
  const router = useRouter();
  const phone = useIsPhone();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  // Pressing Try again asks the same question again; the answer to the last
  // attempt is then stale, and the palette draws the wait rather than the error.
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer<SearchResults> | null>(null);
  const [recent, setRecent] = useState<Answer<RecentRecords> | null>(null);
  const mac = useSyncExternalStore(neverChanges, isMac, notMac);

  // The shortcut shuts it the way Escape and a click outside do, forgetting the
  // search, so the next Ctrl+K opens on what he was busy with and not on the
  // last box he typed in.
  const toggle = useEffectEvent(() => {
    if (open) close();
    else setOpen(true);
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Asked again every time the palette opens: what he was busy with an hour ago
  // is not what he has just done. The last answer stays on screen meanwhile.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const key = String(attempt);
    const timer = setTimeout(async () => {
      const outcome = await guarded(recentRecordsAction)();
      if (!cancelled) setRecent({ key, outcome });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, attempt, guarded]);

  useEffect(() => {
    const query = term.trim();
    if (!open || query.length < MIN_TERM) return;
    let cancelled = false;
    const key = `${attempt}:${query}`;
    const timer = setTimeout(async () => {
      const outcome = await guarded(searchAllAction)(query);
      if (!cancelled) setAnswer({ key, outcome });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open, attempt, guarded]);

  function onOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      return;
    }
    close();
  }

  /**
   * Shut, and forget the last search: the next time it opens, what he types is
   * a new question, and the answer to an old one standing under it while the
   * new one is on its way would be rows about something else. What he was busy
   * with is kept, because it is the same question every time.
   */
  function close() {
    setOpen(false);
    setTerm("");
    setAnswer(null);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  /** Back to the box, empty: the way out of a search that found nothing. */
  function clear() {
    setTerm("");
    input.current?.focus();
  }

  const query = term.trim();
  const typing = query.length >= MIN_TERM;

  // What to show is derived, so nothing has to be cleared as the term changes:
  // the last answer stays on screen while the next one is on its way.
  const fresh = answer !== null && answer.key === `${attempt}:${query}`;
  const results = answer?.outcome.ok ? (answer.outcome.data ?? null) : null;
  const shown = results !== null && !isEmpty(results) ? results : null;
  const failed = typing && fresh && answer !== null && !answer.outcome.ok ? answer.outcome : null;
  const searching = typing && !fresh;
  const nothing = typing && fresh && results !== null && isEmpty(results);
  const rows = typing && failed === null && !nothing ? shown : null;

  const recentFresh = recent !== null && recent.key === String(attempt);
  const recentRows = recent?.outcome.ok ? (recent.outcome.data ?? null) : null;
  const recentFailed =
    !typing && recentFresh && recent !== null && !recent.outcome.ok ? recent.outcome : null;
  const recentWaiting = !typing && recentRows === null && recentFailed === null;

  // A wait with nothing to stand in for it draws the rows' shape; a wait over
  // the last answer keeps the answer and puts a mark in the box instead.
  const skeleton = (searching && rows === null) || recentWaiting;
  const busy = !skeleton && searching && rows !== null;
  const trouble = failed ?? recentFailed;

  function troubleSentence(outcome: { error: string; reason?: "unreachable" }): string {
    return outcome.reason === "unreachable" ? t("shell.searchUnreachable") : outcome.error;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Wider from `xl`, where it carries the whole sentence: at the scale's
        // `text-sm` the Arabic one needs about 450px and was cut at 512.
        className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground sm:max-w-md md:h-9 lg:max-w-lg xl:max-w-xl"
      >
        <Search className="size-4 shrink-0" />
        {/* The long sentence is what the input under it is for; on the button
            it only appears where the button is wide enough to hold it whole.
            At 768 it used to be cut off mid-word in both languages — a label
            that stops in the middle reads as a fault, not as an abbreviation —
            and at 1024 again once Add report joined the bar (P13-S4). */}
        <span data-slot="search-label" className="flex-1 truncate text-start text-sm xl:hidden">
          {t("common.search")}
        </span>
        <span
          data-slot="search-label"
          className="hidden flex-1 truncate text-start text-sm xl:inline"
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
          // `font-mono` and not `.num`: a key cap belongs in the mono face by
          // convention, but `.num` means "this is a figure" and also sets
          // tabular figures, which is meaningless for letters (DESIGN §1).
          className="hidden h-5 shrink-0 items-center rounded border border-line px-1 font-mono text-xs text-faint lg:inline-flex"
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
          // Escape goes back one level before it closes: a typed search is
          // emptied first, which brings back what he was busy with.
          onEscapeKeyDown={(event) => {
            if (term === "") return;
            event.preventDefault();
            setTerm("");
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("shell.searchDialog")}</DialogTitle>
            <DialogDescription>{t("shell.searchHint")}</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <div className="relative">
              <CommandInput
                ref={input}
                value={term}
                onValueChange={setTerm}
                // The long sentence does not fit a phone's box and was cut in
                // the middle of a word in both languages; the short one names
                // the same three things a person types.
                placeholder={phone ? t("shell.searchPlaceholderShort") : t("common.searchPlaceholder")}
              />
              {/* The mark in place while an answer is out over the last one.
                  Invisible for 150 ms, so a fast answer shows nothing. */}
              {busy ? (
                <span
                  aria-hidden="true"
                  data-slot="search-pending"
                  className="link-pending absolute end-4 top-1/2 -translate-y-1/2"
                >
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </span>
              ) : null}
              <span aria-live="polite" className="sr-only">
                {busy || skeleton ? t("common.loading") : ""}
              </span>
            </div>
            {/* Taller than the kit's on a desk, where the records he was busy
                with fit whole under the sentence; the phone keeps the kit's
                height, under a keyboard. It says when there is more below,
                because the kit hides the scrollbar. */}
            <CommandList aria-busy={busy || skeleton || undefined} className="scroll-hint md:max-h-120">
              {typing ? null : (
                <p data-slot="search-hint" className="px-3 pt-3 pb-2 text-sm text-muted-foreground">
                  {t("shell.searchHint")}
                </p>
              )}

              {skeleton ? <RowsSkeleton /> : null}

              {trouble ? (
                <div role="alert" className="flex flex-col items-start gap-3 px-3 py-4">
                  <p className="text-sm text-destructive">{troubleSentence(trouble)}</p>
                  <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                    {t("shell.tryAgain")}
                  </Button>
                </div>
              ) : null}

              {nothing ? (
                <div className="p-2">
                  <Empty
                    size="panel"
                    action={
                      <Button type="button" variant="outline" onClick={clear}>
                        {t("companies.clearSearch")}
                      </Button>
                    }
                  >
                    {t("shell.searchNoResults", { q: query })}
                  </Empty>
                </div>
              ) : null}

              {!typing && recentRows ? (
                <>
                  <Companies
                    heading={t("shell.recentCompanies")}
                    rows={recentRows.companies}
                    role={role}
                    go={go}
                  />
                  <Papers
                    heading={t("shell.recentQuotations")}
                    kind="quotation"
                    rows={recentRows.quotations}
                    go={go}
                  />
                  <Papers
                    heading={t("shell.recentDispatches")}
                    kind="dispatch"
                    rows={recentRows.dispatches}
                    go={go}
                  />
                </>
              ) : null}

              {rows ? (
                <>
                  <Companies heading={t("common.companies")} rows={rows.companies} role={role} go={go} />

                  {rows.contacts.length > 0 ? (
                    <CommandGroup heading={t("common.contacts")}>
                      {rows.contacts.map((row) => (
                        <CommandItem
                          key={row.id}
                          value={`contact-${row.id}`}
                          // A contact is his company, so it lands where the
                          // company lands. Contacts are only ever offered off the
                          // reader's own floor — the coordinator's included, since
                          // §3 gave her one — so the company behind one is always
                          // a company he may open (`src/actions/search.ts`).
                          onSelect={() => go(companyHref(role, row.companyId, row.companyName, true))}
                        >
                          <UserRound className="text-muted-foreground" />
                          <Clip text={row.name} />
                          <Clip text={row.companyName} className="text-xs text-muted-foreground" />
                          <CommandShortcut className="tracking-normal">
                            <Ref>{formatPhone(row.phone)}</Ref>
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
                          <Clip text={row.name} />
                          <CommandShortcut className="flex max-w-[40%] min-w-0 tracking-normal">
                            <Clip text={row.companyName} />
                          </CommandShortcut>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}

                  <Papers heading={t("common.quotations")} kind="quotation" rows={rows.quotations} go={go} />

                  {fresh && rows.capped ? (
                    <p data-slot="search-capped" className="px-3 pt-1 pb-3 text-xs text-muted-foreground">
                      {t("shell.searchCapped")}
                    </p>
                  ) : null}
                </>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A company row, drawn the same whether it was found or remembered. */
function Companies({
  heading,
  rows,
  role,
  go,
}: {
  heading: string;
  rows: PaletteCompany[];
  role: Role;
  go: (href: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <CommandGroup heading={heading}>
      {rows.map((row) => (
        <CommandItem
          key={row.id}
          value={`company-${row.id}`}
          onSelect={() => go(companyHref(role, row.id, row.name, row.mine))}
        >
          <Building2 className="text-muted-foreground" />
          <Clip text={row.name} />
          {row.city ? (
            // A city is a word or two and is never the part that gives way.
            <CommandShortcut className="shrink-0 tracking-normal">{row.city}</CommandShortcut>
          ) : null}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** A quotation or a dispatch row: Kladra's name for the paper, and its company. */
function Papers({
  heading,
  kind,
  rows,
  go,
}: {
  heading: string;
  kind: "quotation" | "dispatch";
  rows: PalettePaper[];
  go: (href: string) => void;
}) {
  if (rows.length === 0) return null;
  const Icon = kind === "quotation" ? FileText : Truck;
  const list = kind === "quotation" ? "/quotations" : "/dispatches";
  return (
    <CommandGroup heading={heading}>
      {rows.map((row) => (
        <CommandItem key={row.id} value={`${kind}-${row.id}`} onSelect={() => go(`${list}?open=${row.id}`)}>
          <Icon className="text-muted-foreground" />
          {/* The number is a few characters and never cut; the company takes
              the rest of the row, where 40% cut a long one on a wide screen. */}
          <Ref className="shrink-0">{row.number}</Ref>
          <CommandShortcut className="flex min-w-0 tracking-normal">
            <Clip text={row.companyName} />
          </CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/**
 * A name cut to fit its row loses its own END. The app's run — a truncating
 * span around a `<bdi>` — keeps the page's direction on the box, and the box
 * clips at the page's end: on an English row an Arabic company lost its FIRST
 * word, «…المعمار الحديث للاستشارات الهندسية» for «مكتب المعمار …», which reads
 * as another company. Here the box takes the name's direction instead. It is
 * never wider than its text (no flex-1, no width), so only the ellipsis moves,
 * never the name; and `dir` isolates the run as a `<bdi>` would. It carries no
 * margin of its own: `ms-auto` on a box of the other direction resolves to the
 * other side, so a name meant for the row's end sits in a `CommandShortcut`.
 */
function Clip({ text, className }: { text: string; className?: string }) {
  return (
    <span dir="auto" className={cn("min-w-0 truncate", className)}>
      {text}
    </span>
  );
}

/**
 * The shape of a group of rows while its answer is out: a heading and three
 * rows at the row's own height (44 on a phone, where every row is a thumb's
 * target), drawn once and standing still (DESIGN §1b).
 */
function RowsSkeleton() {
  return (
    <div data-slot="search-skeleton" className="flex flex-col p-1">
      <div className="flex h-8 items-center px-2">
        <Skeleton className="h-3 w-24" />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex h-9 items-center gap-2 px-2 max-md:h-11">
          <Skeleton className="size-4 rounded" />
          <Skeleton className={index === 1 ? "h-3 w-32" : "h-3 w-44"} />
          <Skeleton className="ms-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
