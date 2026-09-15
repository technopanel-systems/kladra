"use client";

import { Component, useRef, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useCloseDrawer } from "@/components/dispatches/dispatches-table";
import { RecordPanel } from "@/components/ui-ext/record-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";

/**
 * A dispatch that could not be read fails in its own panel (DESIGN §8: a part
 * that failed says so in its own place and does not blank the whole screen).
 *
 * The drawer is a server component under the list, and a query that threw in it
 * reached the screen's boundary: the list went, and with it the chip, the search
 * and the place on the desk, over one load. The company drawer was given this in
 * S12.2; the dispatch drawer, which the coordinator opens more than any other
 * panel, had nothing. Try again re-reads the page in a transition and lets the
 * drawer render again when the answer is in; closing it is the drawer's own
 * close. A redirect or a not-found is the router's, not a failure, and passes.
 */
export function DispatchTrouble({ param, children }: { param: string; children: ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const boundary = useRef<TroubleBoundary>(null);
  return (
    <TroubleBoundary
      ref={boundary}
      failed={
        <DispatchFailed
          param={param}
          retry={() =>
            startTransition(() => {
              router.refresh();
              boundary.current?.reset();
            })
          }
        />
      }
    >
      {children}
    </TroubleBoundary>
  );
}

function isRouterSignal(error: unknown): boolean {
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? error.digest : null;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

class TroubleBoundary extends Component<
  { failed: ReactNode; children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (isRouterSignal(error)) throw error;
    return this.props.failed;
  }
}

function DispatchFailed({ param, retry }: { param: string; retry: () => void }) {
  const t = useTranslations();
  const close = useCloseDrawer(param);
  return (
    <Sheet open onOpenChange={(next) => (next ? undefined : close())}>
      <RecordPanel className="scroller">
        <div role="alert" data-slot="drawer-failed" className="flex flex-col items-start gap-4 p-4 pe-12">
          <div className="flex flex-col gap-2">
            <SheetTitle className="text-base">{t("drawer.dispatchFailed")}</SheetTitle>
            <SheetDescription>{t("shell.failedBody")}</SheetDescription>
          </div>
          <Button type="button" variant="brand" onClick={retry}>
            {t("shell.tryAgain")}
          </Button>
        </div>
      </RecordPanel>
    </Sheet>
  );
}
