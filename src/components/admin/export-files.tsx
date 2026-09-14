"use client";

import { Building2, Download, FileText, Loader2, Truck, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ExportName } from "@/lib/export";

/**
 * The admin's three files, as one labelled group (P13-G6, S12.9; DESIGN §8).
 *
 * It was three bare rows, each a sentence and an outline button — the shape any
 * kit draws when asked for "a list of downloads". Now each file is a row that
 * says what it is and what it holds, led by the mark the rail gives the same
 * list, inside one bordered group under the sentence that says what the files
 * are for.
 *
 * And the press says what happens to it. It was a plain link with `download`,
 * which the browser handles out of sight: a file that takes a moment to build
 * showed nothing, and one that failed — a session that ended, a server out of
 * reach — saved an error page as a .csv, or nothing, and said nothing. So the
 * file is fetched here: the pressed Download carries the pending mark and says
 * it is preparing once the wait can be seen, the browser is handed the finished
 * file under the name the server gave it, and a failure is a toast that stays
 * until it is closed, with the next step in it (DESIGN §8: severity picks the
 * surface).
 *
 * Busy is not disabled (§8): the pressed button keeps its place and focus and
 * says so; a second press while it works is simply not a second download.
 */

const FILES: Record<ExportName, { nameKey: string; icon: LucideIcon }> = {
  companies: { nameKey: "common.companies", icon: Building2 },
  quotations: { nameKey: "common.quotations", icon: FileText },
  dispatches: { nameKey: "common.dispatches", icon: Truck },
};

/** A wait shorter than this shows nothing, like a pressed link (D126). */
const SHOW_AFTER_MS = 150;

export function ExportFiles({ names }: { names: readonly ExportName[] }) {
  const t = useTranslations();

  return (
    <section aria-labelledby="export-files" className="flex flex-col gap-2">
      <p id="export-files" className="max-w-prose text-sm text-muted-foreground">
        {t("admin.exportHint")}
      </p>
      <ul className="card-face flex flex-col">
        {names.map((name) => {
          const Icon = FILES[name].icon;
          return (
            <li
              key={name}
              data-file={name}
              className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-0 md:px-4"
            >
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
              >
                <Icon className="size-4" />
              </span>
              {/* A row on a desk and a column on a phone (DESIGN §5): beside the
                  button at 375 the sentence had a third of the width and ran
                  to five lines. */}
              <span className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{t(FILES[name].nameKey)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`admin.exportFile.${name}`)}
                  </span>
                </span>
                <DownloadButton name={name} title={t(FILES[name].nameKey)} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DownloadButton({ name, title }: { name: ExportName; title: string }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const working = useRef(false);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  async function download() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      let response: Response;
      let body: Blob;
      // A failure stays until it is closed, and its next step is a button on
      // it: the same press again (DESIGN §8). Both labels are the app's, in the
      // reader's language — the toast kit's own close mark is named in English.
      const failed = (message: string) =>
        toast.error(message, {
          duration: Infinity,
          action: { label: t("shell.tryAgain"), onClick: () => void download() },
          cancel: { label: t("common.close"), onClick: () => {} },
        });
      try {
        response = await fetch(`/api/export/${name}`, { cache: "no-store" });
        body = response.ok ? await response.blob() : new Blob();
      } catch {
        // Nothing came back at all: the wire, not the file.
        failed(t("admin.exportUnreachable"));
        return;
      }
      if (!response.ok) {
        failed(t("admin.exportFailed", { file: title }));
        return;
      }

      // The name the server gave it, with the day in it, so three downloads a
      // month apart do not overwrite each other (the route's own rule).
      const file =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
        `kladra-${name}.csv`;
      const href = URL.createObjectURL(body);
      const link = document.createElement("a");
      link.href = href;
      link.download = file;
      document.body.append(link);
      link.click();
      link.remove();
      // Let go once the browser has surely taken its copy; revoked at once, a
      // browser that reads the address late saves nothing.
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      toast.success(t("admin.exportReady", { file }));
    } finally {
      working.current = false;
      setBusy(false);
      setShown(false);
    }
  }

  const pending = busy && shown;

  return (
    <Button
      type="button"
      variant="outline"
      className="shrink-0 self-start md:self-auto"
      aria-busy={busy || undefined}
      onClick={download}
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" data-slot="export-pending" />
      ) : (
        <Download aria-hidden="true" />
      )}
      <span>{pending ? t("admin.preparing") : t("admin.download")}</span>
      {/* Three buttons say Download; a reader moving by controls hears which. */}
      <span className="sr-only">{title}</span>
    </Button>
  );
}
