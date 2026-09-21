/**
 * The one thing about this deployment the app can check for itself, checked at
 * the moment it starts rather than on a list somebody reads once.
 *
 * `AUTH_URL`'s protocol is what Auth.js uses to decide whether the session
 * cookie carries `Secure` and the `__Secure-` prefix, and getting it wrong has
 * no symptom: login works, every screen renders, the suite passes, and the
 * token crosses the tunnel in the clear where anyone on the same café wifi can
 * lift a thirty-day session out of the first request a browser makes before
 * Cloudflare's redirect. `.claude/rules/deploy.md` has called that failure
 * silent since it was written, and the answer to it was a checkbox in the
 * README (P14.5).
 *
 * Two halves, because one cannot catch both mistakes. `docker-compose.yml`
 * refuses to start the container at all when `PUBLIC_URL` is unset — that is
 * the omission. This is the typo: a `PUBLIC_URL` that was set, to http,
 * somewhere that is not this machine.
 *
 * Loopback over http is allowed, and deliberately: `npm run start` on the
 * developer's own PC serves 127.0.0.1 and nothing leaves the machine. What that
 * leaves open is somebody writing `PUBLIC_URL=http://localhost:3100` into `.env`
 * by hand — which no longer happens by forgetting, and which the line above it
 * in the compose file says not to do.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Throws rather than returns: the caller is Next's `register`, and a refusal there stops the server. */
export function assertSecureCookies(): void {
  if (process.env.NODE_ENV !== "production") return;

  const raw = process.env.AUTH_URL?.trim();
  if (!raw) {
    throw new Error(
      "AUTH_URL is not set. In production it must be the https address this app is reached at — " +
        "set PUBLIC_URL in .env (see README.md). Without it the session cookie is not Secure.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`AUTH_URL is not a URL: ${raw}. Set PUBLIC_URL in .env to the https tunnel hostname.`);
  }

  if (url.protocol === "https:") return;
  if (LOOPBACK.has(url.hostname)) return;

  throw new Error(
    `AUTH_URL is ${url.protocol}//${url.host}, so the session cookie will not be Secure and the ` +
      "token will cross the network in the clear. Set PUBLIC_URL in .env to the https tunnel hostname.",
  );
}
