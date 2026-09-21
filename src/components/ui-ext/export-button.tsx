"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportName } from "@/lib/export/names";

/**
 * The file this screen is holding (SPEC §3, P14 14.10; D19 before it).
 *
 * The founder: "each export carries the filters of the screen it came from".
 * So the control reads the ADDRESS rather than being handed a query: whatever
 * `?q=`, `?filter=`, `?status=` or `?rep=` the screen is standing on goes to
 * the builder untouched, and a screen cannot forget to pass one. It is the same
 * promise the builders keep on their side by asking the screen's own `narrowTo`
 * — neither half is a thing anybody has to remember (src/lib/export/kit.ts).
 *
 * And the reader's language, because a file whose column headings, statuses and
 * category names are all words is in one language or the other (D6).
 *
 * **One control per screen, whether the screen has one file or two.** The
 * customers screen holds both the customers and their contacts, and two buttons
 * both saying Export would be two controls a reader has to tell apart by their
 * quiet half. With one file it is a button; with more it is the same button
 * opening a short menu that names them. Eight screens of the ten never see the
 * menu.
 *
 * The press says what happens to it. A plain link with `download` is handled
 * out of sight: a file that takes a moment to build shows nothing, and one that
 * fails — a session that ended, a server out of reach — saves an error page as
 * a .csv, or nothing, and says nothing. So it is fetched here: the pressed
 * button carries the pending mark and says it is preparing once the wait can be
 * seen, the browser is handed the finished file under the name the server gave
 * it, and a failure is a toast that stays until it is closed with the next step
 * on it (DESIGN §8: severity picks the surface).
 *
 * Busy is not disabled (§8): the pressed button keeps its place and focus and
 * says so; a second press while it works is simply not a second download.
 */

/** A wait shorter than this shows nothing, like a pressed link (D126). */
const SHOW_AFTER_MS = 150;

/**
 * The drawer a screen has open is not a filter (`?open=`), and neither is the
 * row a table has scrolled to. They ride in the same address as the narrowing,
 * so they are dropped here rather than in each builder.
 */
const NOT_A_FILTER = new Set(["open", "locale"]);

/** One file this screen can hand over, and what to call it. */
export type ExportFile = { name: ExportName; title: string };

export function ExportButton({
  files,
  className,
}: {
  /** The screen's files, in the order a reader would look for them. */
  files: readonly ExportFile[];
  className?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const working = useRef(false);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  async function download(file: ExportFile) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of search.entries()) {
        // Appended, never set: a door opened from a figure names two segments
        // and three cities in three `?city=` of its own (src/lib/narrowing.ts),
        // and keeping only the last of each would narrow the file differently
        // from the list it came from — the one thing this control is for.
        if (!NOT_A_FILTER.has(key) && value) params.append(key, value);
      }
      // The route has no locale prefix — it is an API path — so the language
      // travels as a parameter.
      params.set("locale", locale);

      let response: Response;
      let body: Blob;
      // A failure stays until it is closed, and its next step is a button on
      // it: the same press again (DESIGN §8). Both labels are the app's, in the
      // reader's language — the toast kit's own close mark is named in English.
      const failed = (message: string) =>
        toast.error(message, {
          duration: Infinity,
          action: { label: t("shell.tryAgain"), onClick: () => void download(file) },
          cancel: { label: t("common.close"), onClick: () => {} },
        });
      try {
        response = await fetch(`/api/export/${file.name}?${params}`, { cache: "no-store" });
        body = response.ok ? await response.blob() : new Blob();
      } catch {
        // Nothing came back at all: the wire, not the file.
        failed(t("common.exportUnreachable"));
        return;
      }
      if (!response.ok) {
        failed(t("common.exportFailed", { file: file.title }));
        return;
      }

      // The name the server gave it, with the day in it, so three downloads a
      // month apart do not overwrite each other in the Downloads folder.
      const saved =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
        `kladra-${file.name}.csv`;
      const href = URL.createObjectURL(body);
      const link = document.createElement("a");
      link.href = href;
      link.download = saved;
      document.body.append(link);
      link.click();
      link.remove();
      // Let go once the browser has surely taken its copy; revoked at once, a
      // browser that reads the address late saves nothing.
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      toast.success(t("common.exportReady", { file: saved }));
    } finally {
      working.current = false;
      setBusy(false);
      setShown(false);
    }
  }

  const pending = busy && shown;
  const one = files.length === 1 ? files[0] : null;

  const face = (
    <>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" data-slot="export-pending" />
      ) : (
        <Download aria-hidden="true" />
      )}
      <span>{pending ? t("common.preparing") : t("common.export")}</span>
      {/* Every screen's button says Export; where there is one file, a reader
          moving by controls hears which. Where there are two, the menu's own
          items name them. */}
      {one ? <span className="sr-only">{one.title}</span> : null}
    </>
  );

  if (one) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        data-slot="export"
        aria-busy={busy || undefined}
        onClick={() => void download(one)}
      >
        {face}
      </Button>
    );
  }

  return (
    /* Not modal: choosing a file starts a fetch and leaves the page alone, and
       a modal menu holds `pointer-events: none` on the body while it closes —
       long enough to swallow the press on the toast the failure puts up, which
       is the one press that thing exists for (D197). */
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          data-slot="export"
          aria-busy={busy || undefined}
        >
          {face}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        {files.map((file) => (
          <DropdownMenuItem key={file.name} onSelect={() => void download(file)}>
            {file.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
