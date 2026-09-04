/**
 * The one Server-Sent Events route (CLAUDE.md § Stack). No polling anywhere in
 * Kladra; this is how a screen learns that somebody else changed something.
 *
 * Shape of the thing:
 *   writer  → notifyLive() → pg_notify('kladra', {userIds, event}) in its own tx
 *   here    → ONE process-wide pg Client on LISTEN kladra, fanning out
 *   browser → EventSource in src/components/live/live-provider.tsx
 *
 * The listener is a dedicated `new Client`, never the pool: a pooled connection
 * is handed back and reused, and a LISTEN registration on it silently belongs to
 * whoever borrows it next. It is a singleton on globalThis so a hot reload in
 * dev leaves one listener, not one per compile.
 *
 * When that connection drops, subscribers are cut loose rather than left on a
 * dead socket: the browser reconnects after `retry: 3000` and re-syncs its
 * count from /api/notifications/count. Silently missing events is the worse bug.
 */
import { Client } from "pg";
import { NotAllowed, requireActor } from "@/lib/authz";
import { LIVE_CHANNEL, parseLivePayload } from "@/lib/live";
import type { LiveEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // the listener is a real pg socket, never edge

/** A comment line often enough to beat any idle proxy timeout. */
const HEARTBEAT_MS = 25_000;
/** Reconnect backoff for the listener: 0.5 s doubling to 30 s, plus jitter. */
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 30_000;

type Subscriber = {
  userId: string;
  send: (event: LiveEvent) => void;
  drop: () => void;
};

type Hub = {
  subscribers: Map<number, Subscriber>;
  nextId: number;
  client: Client | null;
  connecting: Promise<void> | null;
  attempt: number;
  retry: ReturnType<typeof setTimeout> | null;
};

declare global {
  // One listener per process, surviving Next.js hot reloads.
  var __kladraLiveHub: Hub | undefined;
}

function hub(): Hub {
  const existing = globalThis.__kladraLiveHub;
  if (existing) return existing;
  const created: Hub = {
    subscribers: new Map(),
    nextId: 1,
    client: null,
    connecting: null,
    attempt: 0,
    retry: null,
  };
  globalThis.__kladraLiveHub = created;
  return created;
}

/** Cut every stream loose; each browser reconnects and re-syncs its count. */
function dropAll(h: Hub): void {
  for (const sub of [...h.subscribers.values()]) {
    try {
      sub.drop();
    } catch {
      // a stream already torn down by the runtime; nothing to do
    }
  }
  h.subscribers.clear();
}

function loseClient(h: Hub, client: Client | null): void {
  if (client && h.client !== client) return; // a stale handler from an old socket
  h.client = null;
  if (client) {
    client.removeAllListeners();
    // The socket is already gone in the error case; end() is best-effort.
    void client.end().catch(() => {});
  }
  dropAll(h);
  scheduleReconnect(h);
}

function scheduleReconnect(h: Hub): void {
  if (h.retry || h.connecting) return;
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** h.attempt);
  const delay = base / 2 + Math.random() * (base / 2);
  h.attempt += 1;
  const timer = setTimeout(() => {
    h.retry = null;
    // Nobody is listening any more: the next reader's GET opens it again.
    if (h.subscribers.size === 0) return;
    void ensureListening(h).catch(() => {});
  }, delay);
  unref(timer);
  h.retry = timer;
}

/**
 * Open the listener, at most once at a time. On failure the backoff is armed
 * here — `h.connecting` is cleared FIRST, because scheduleReconnect refuses to
 * queue a retry while a connection attempt is believed to be in flight.
 */
async function ensureListening(h: Hub): Promise<void> {
  if (h.client) return;
  if (h.connecting) return h.connecting;

  const attempt = openListener(h);
  h.connecting = attempt;
  try {
    await attempt;
  } catch (err) {
    if (h.connecting === attempt) h.connecting = null;
    scheduleReconnect(h);
    throw err;
  }
  if (h.connecting === attempt) h.connecting = null;
}

async function openListener(h: Hub): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString: url, application_name: "kladra-live" });
  client.on("error", () => loseClient(h, client));
  client.on("end", () => loseClient(h, client));
  client.on("notification", (msg) => {
    if (msg.channel !== LIVE_CHANNEL || !msg.payload) return;
    const payload = parseLivePayload(msg.payload);
    if (!payload) return;
    const targets = new Set(payload.userIds);
    for (const sub of h.subscribers.values()) {
      if (targets.has(sub.userId)) sub.send(payload.event);
    }
  });

  try {
    await client.connect();
    await client.query(`listen ${LIVE_CHANNEL}`);
  } catch (err) {
    client.removeAllListeners();
    void client.end().catch(() => {});
    throw err;
  }
  h.client = client;
  h.attempt = 0;
}

/** Timers must not hold the process open on their own. */
function unref(timer: ReturnType<typeof setTimeout>): void {
  (timer as unknown as { unref?: () => void }).unref?.();
}

export async function GET(request: Request) {
  let userId: string;
  try {
    userId = (await requireActor()).id;
  } catch (err) {
    if (err instanceof NotAllowed) return new Response("Unauthorized", { status: 401 });
    throw err;
  }

  const h = hub();
  // Do not fail the stream because Postgres is momentarily down: the reader
  // gets an open channel that goes quiet, and the backoff keeps trying.
  void ensureListening(h).catch(() => {});

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let subscriptionId = -1;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const teardown = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    h.subscribers.delete(subscriptionId);
    request.signal.removeEventListener("abort", teardown);
    try {
      controller?.close();
    } catch {
      // already closed by the runtime
    }
    controller = null;
  };

  const write = (chunk: string) => {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      teardown(); // the client hung up between the check and the write
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      subscriptionId = h.nextId++;
      h.subscribers.set(subscriptionId, {
        userId,
        send: (event) => write(`event: live\ndata: ${JSON.stringify(event)}\n\n`),
        drop: teardown,
      });

      write("retry: 3000\n\n");
      write(": open\n\n"); // flushes headers through any buffering proxy

      const timer = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      unref(timer);
      heartbeat = timer;

      if (request.signal.aborted) teardown();
      else request.signal.addEventListener("abort", teardown);
    },
    cancel() {
      teardown();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
