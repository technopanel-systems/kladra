"use client";

/**
 * The browser end of live updates (DESIGN §2: "the screen tells you what
 * changed … nobody refreshes"). Mounted once, high in the signed-in tree.
 *
 * It holds one EventSource on /api/events. A `notification` event carries the
 * bell's new number; every other event means a record somebody else touched, so
 * the server components re-render (router.refresh) and the row is marked as
 * arrived for two seconds — that is the `row-arrived` highlight in globals.css.
 * The two seconds start when the refresh has landed, not when the event did:
 * the other way round, the round trip that paints the row is subtracted from
 * them, and a highlight that fades before it is seen is a highlight nobody
 * gets (D105). "Landed" is what a list reports when what its rows say has
 * changed on screen (`useArrivedIds` / `useLanded` in src/hooks/use-arrived.ts):
 * a refresh changes the rows' content exactly when the refreshed tree has
 * painted, and tests/live.spec.ts times the highlight from that moment.
 *
 * EventSource reconnects by itself after the server's `retry: 3000`. Because a
 * gap can swallow events, every reconnect re-syncs the count from
 * /api/notifications/count rather than trusting the number it was holding.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import type { LiveEvent } from "@/lib/types";

/** How long a row stays highlighted after arriving. Matches globals.css. */
export const ARRIVED_MS = 2000;
/** Several writes in one second are one refresh, not five. */
const REFRESH_COALESCE_MS = 200;
/**
 * How long an arrival waits for a list to report its landing. Longer than any
 * refresh; shorter than a walk to another screen, so a row touched minutes ago
 * is not presented as just arrived when a list finally mounts.
 */
const WAITING_MS = 10_000;

export type LiveState = {
  /** Unread notifications for the signed-in user. */
  unread: number;
  /** Ids touched by someone else in the last two seconds. */
  arrivedIds: ReadonlySet<string>;
  /** The most recent event, for anything that wants to react to one. */
  lastEvent: LiveEvent | null;
  /**
   * A list's report that its rows are on screen: whatever arrived while the
   * refresh was in flight starts its two seconds now. Stable across renders.
   */
  landed: () => void;
};

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

const LiveContext = createContext<LiveState | null>(null);

export function LiveProvider({
  userId,
  initialUnread,
  children,
}: {
  userId: string;
  initialUnread: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [arrivedIds, setArrivedIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);

  // next-intl's useRouter returns a fresh object each render; keeping it in a
  // ref is what stops the EventSource effect from tearing down every render.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  // `initialUnread` seeds the count and is deliberately not watched afterwards:
  // the live channel and the reconnect re-sync are the only things that move it.
  // Copying a later render's prop back in would overwrite a fresher event with
  // a number the server read a moment before it happened. Remount with a `key`
  // if the count ever has to be pushed down from the server.

  const arrivedTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ids whose refresh is still in flight, with when each arrived; they become
  // arrived when a list reports the landing.
  const waiting = useRef(new Map<string, number>());

  const markArrived = useCallback((id: string) => {
    if (!id) return;
    setArrivedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const timers = arrivedTimers.current;
    const running = timers.get(id);
    if (running) clearTimeout(running);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        setArrivedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, ARRIVED_MS),
    );
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      routerRef.current.refresh();
    }, REFRESH_COALESCE_MS);
  }, []);

  // A list's rows are on screen: everything that arrived while the refresh
  // was in flight is highlighted now, for the full two seconds, on the row as
  // it now reads.
  const landed = useCallback(() => {
    const cutoff = Date.now() - WAITING_MS;
    const ids = [...waiting.current].filter(([, at]) => at >= cutoff).map(([id]) => id);
    waiting.current.clear();
    for (const id of ids) markArrived(id);
  }, [markArrived]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let everOpened = false;
    const source = new EventSource("/api/events");

    const resync = () => {
      void fetch("/api/notifications/count", {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then((res) => (res.ok ? (res.json() as Promise<{ unread?: unknown }>) : null))
        .then((body) => {
          if (cancelled || !body || typeof body.unread !== "number") return;
          setUnread(body.unread);
        })
        .catch(() => {
          // offline or signed out; the next reconnect tries again
        });
    };

    const onOpen = () => {
      // The first open follows a server render that already supplied the count.
      if (!everOpened) {
        everOpened = true;
        return;
      }
      resync();
      scheduleRefresh();
    };

    const onLive = (message: MessageEvent<string>) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }
      if (!event || typeof event.type !== "string") return;
      setLastEvent(event);
      if (event.type === "resync") {
        // The channel's listener was away and is back: the count and the
        // screen are both re-read, as after a reconnect of our own (D105).
        resync();
        scheduleRefresh();
        return;
      }
      if (event.type === "notification") {
        setUnread(event.unread);
        return;
      }
      if (event.id) waiting.current.set(event.id, Date.now());
      scheduleRefresh();
    };

    source.addEventListener("open", onOpen);
    source.addEventListener("live", onLive as EventListener);

    return () => {
      cancelled = true;
      source.removeEventListener("open", onOpen);
      source.removeEventListener("live", onLive as EventListener);
      source.close();
    };
  }, [userId, scheduleRefresh]);

  // Timers outlive React's own bookkeeping; clear them when the tree goes.
  useEffect(() => {
    const timers = arrivedTimers.current;
    const pending = waiting.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, []);

  const value = useMemo<LiveState>(
    () => ({ unread, arrivedIds, lastEvent, landed }),
    [unread, arrivedIds, lastEvent, landed],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** Inside the signed-in tree. Throws outside it, because that is a wiring bug. */
export function useLive(): LiveState {
  const value = useContext(LiveContext);
  if (!value) throw new Error("useLive must be used inside <LiveProvider>");
  return value;
}

/**
 * For components that also render outside the signed-in tree (login, error
 * pages): null instead of a crash. src/hooks/use-arrived.ts uses this.
 */
export function useLiveOptional(): LiveState | null {
  return useContext(LiveContext);
}
