"use client";

import { NotebookPen } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import type { Channel } from "@/db/schema";

/**
 * The report popup (SPEC §3 P13, 13.8): one thing that happened, in twenty
 * seconds on a phone.
 *
 * The fields are in the order a rep has the answers when a call ends: who it
 * was (the company, then the person — the main contact already chosen), what
 * it was about if it was about a paper, what kind of thing happened, what came
 * of it, when the next one is, and a line in his own words. The next follow-up
 * stands above the words since the Stage 3 audit: where a call was owed it is a
 * question he must answer — a date, or "no next step" — because a report that
 * left the old date standing left the reminder red after the work was done
 * (S52). The day is last; it is nearly always today. A call to the main contact
 * that reached him, from the top bar, is: Add report · the company box · the
 * company · Call · Reached · the text box · Send — seven presses and the words.
 * From a customer's drawer or a call card the company is already there, and it
 * is five.
 *
 * ONE popup for the whole app (D82). It was one log dialog per screen, each
 * screen serialising what every row on it could be logged against; the popup is
 * reachable from everywhere now, so it reads what it needs when it opens, and
 * it is mounted once — in the top bar, which is on every signed-in screen — and
 * opened from anywhere by `useReport` or a `ReportButton`. The two talk through
 * a store rather than a React context because the top bar is not an ancestor of
 * the drawers that open it; the store refuses to open with no popup mounted, so
 * a button that nothing would answer fails loudly instead of doing nothing.
 */

/** A report being corrected rather than written (D70). */
export type ReportEdit = {
  id: string;
  companyId: string;
  companyName: string;
  text: string;
  kind: Channel;
  outcomeId: number;
  contactId: string | null;
  projectId: string | null;
  quotationId: string | null;
  dispatchId: string | null;
};

/** What the popup opens prefilled with — whatever the screen it is opened from knows. */
export type ReportRequest = {
  companyId?: string | null;
  /** Shown at once while the rest loads; the popup reads it again anyway. */
  companyName?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  quotationId?: string | null;
  dispatchId?: string | null;
  /** What happened, where the screen already knows: a card under "calls due" opens on Call. */
  kind?: Channel;
  entry?: ReportEdit;
};

/* ---- the store ---------------------------------------------------------------- */

/**
 * The form, which is its own download (report-panel.tsx says why). It renders
 * only once somebody has pressed a report button, so the server never draws it.
 */
const ReportPanel = dynamic(() =>
  import("@/components/reports/report-panel").then((panel) => panel.ReportPanel),
);

type Opened = { request: ReportRequest; generation: number; open: boolean };

let opened: Opened | null = null;
let hosts = 0;
/**
 * Whether the person signed in may write at all. False while an admin is viewing
 * as somebody (D42, D52): every write refuses a viewer, so no button offers one.
 * True until the host says otherwise, so an ordinary screen draws its buttons in
 * the first byte of HTML and only a viewer's disappear after hydration.
 */
let writable = true;
const listeners = new Set<() => void>();

function publish(next: Opened | null): void {
  opened = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a report can be written from this screen — the bottom bar asks (D42). */
export function useReportWritable(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => writable,
    () => true,
  );
}

function openReport(request: ReportRequest): void {
  if (hosts === 0) throw new Error("A report was opened with no ReportDialogHost mounted");
  // A new form for every press: the panel is keyed on the generation, so its
  // state is built from this request and never carried over from the last one.
  publish({ request, generation: (opened?.generation ?? 0) + 1, open: true });
}

function setOpen(open: boolean): void {
  // The panel stays mounted while it animates out, and is replaced — not reset
  // — by the next press.
  if (opened) publish({ ...opened, open });
}

/**
 * A function that opens the popup prefilled with `prefill`, and with anything
 * passed to it on top. Stable for the same prefill values.
 */
export function useReport(prefill: ReportRequest = {}): (override?: ReportRequest) => void {
  const { companyId, companyName, contactId, projectId, quotationId, dispatchId, kind, entry } =
    prefill;
  return useCallback(
    (override: ReportRequest = {}) =>
      openReport({
        companyId,
        companyName,
        contactId,
        projectId,
        quotationId,
        dispatchId,
        kind,
        entry,
        ...override,
      }),
    [companyId, companyName, contactId, projectId, quotationId, dispatchId, kind, entry],
  );
}

/**
 * The button a screen renders. An ordinary `Button` — variant, size, class and
 * aria-label pass straight through — that opens the popup prefilled with what
 * the screen knows. `icon` draws the notebook here rather than taking it as a
 * child: an SVG handed in from a server component is serialised once per row.
 */
export function ReportButton({
  companyId,
  companyName,
  contactId,
  projectId,
  quotationId,
  dispatchId,
  kind,
  entry,
  icon = false,
  onClick,
  children,
  ...button
}: Omit<ComponentProps<typeof Button>, "asChild"> & ReportRequest & { icon?: boolean }) {
  const open = useReport({
    companyId,
    companyName,
    contactId,
    projectId,
    quotationId,
    dispatchId,
    kind,
    entry,
  });
  return (
    <Button
      type="button"
      {...button}
      aria-haspopup="dialog"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) open();
      }}
    >
      {icon ? <NotebookPen aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}

/** The one popup. Mounted once, in the top bar (D82). */
export function ReportDialogHost({ enabled }: { enabled: boolean }) {
  const state = useSyncExternalStore(
    subscribe,
    () => opened,
    () => null,
  );

  useEffect(() => {
    hosts += 1;
    writable = enabled;
    for (const listener of listeners) listener();
    return () => {
      hosts -= 1;
    };
  }, [enabled]);

  // Fetch the form while nobody is waiting for it, so the first press opens at
  // once rather than after a download on a phone's connection. A viewer cannot
  // write, so nothing is fetched for one.
  useEffect(() => {
    if (!enabled) return;
    const load = () => void import("@/components/reports/report-panel");
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(load);
      return () => window.cancelIdleCallback(idle);
    }
    const later = window.setTimeout(load, 2000);
    return () => window.clearTimeout(later);
  }, [enabled]);

  if (!state) return null;
  return (
    <ReportPanel
      key={state.generation}
      open={state.open}
      onOpenChange={setOpen}
      request={state.request}
    />
  );
}
