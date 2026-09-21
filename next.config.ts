import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Points the plugin at our request config (messages/<locale>/*.json merged there).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // The round development badge sat over the lowest button of every phone sheet in
  // every screenshot the review passes read (P13 G2), and it is not the app. Build
  // errors still open their own overlay.
  devIndicators: false,
  // Emits a self-contained server bundle so the Docker runtime stage does not
  // need node_modules. See Dockerfile.
  output: "standalone",

  // Next 16 takes an exclusive lock at `<distDir>/lock` and refuses to start a
  // second dev server in the same directory. The test server (3101, database
  // kladra_test) has to run alongside the developer's (3100), so it gets its
  // own build directory and therefore its own lock. Only scripts/dev-test.ts
  // sets this; every other command builds into `.next` as usual.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // `next dev` otherwise appends a self-re-adding block to CLAUDE.md on every
  // start. CLAUDE.md is one of the five authority files and is hand-written,
  // not a generated artefact. The Next 16 docs it points at are still readable
  // at node_modules/next/dist/docs/ — the README says so instead.
  agentRules: false,

  // It names the framework in every response, which is one fewer thing an
  // attacker has to guess. Free to remove.
  poweredByHeader: false,

  /**
   * The four response headers that earn their place in THIS app (P14.5).
   * Next.js sets none of these by default, and the app had none.
   *
   * What is deliberately not here:
   *
   * - **`Permissions-Policy`.** Kladra asks for no camera, no microphone, no
   *   location and no payment, and embeds no third-party frame. There is
   *   nothing to deny and nobody to deny it to; the header would be a line
   *   nobody can ever check.
   * - **`Content-Security-Policy`.** It is the one header on the list that can
   *   silently break a screen — in one locale only — and the only one that
   *   needs real work rather than a line: a nonce threaded through the root
   *   layout, `next/font`'s injected styles, Recharts' own `<style>` block, and
   *   a `style-src` that Tailwind v4 will fight. Its genuine value here is not
   *   blocking injected script (there is no way in: no `dangerouslySetInnerHTML`
   *   with user data, no `eval`) but `connect-src` and `form-action` bounding
   *   where a future hole could send fourteen people's customer list. Worth
   *   doing; worth doing on purpose, with screenshots, in its own slice.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            /**
             * The other half of the `Secure` cookie (src/lib/deploy-check.ts).
             * That flag stops the cookie going out over http; this stops the
             * browser making the http request at all — the first one, on every
             * new device, where a rep types the hostname without a scheme and
             * the session rides along in the clear before Cloudflare's
             * redirect. Browsers ignore it on an http response, so it costs
             * nothing on a developer's loopback.
             */
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            /**
             * Every write here is a same-origin server action, so SameSite=Lax
             * and Next's own origin check already cover classic CSRF. What
             * nothing covered is the tunnel hostname being framed inside a page
             * a rep was phished onto: Kladra has one-press destructive controls
             * — archive, mark lost, deactivate — and asks for no password
             * before any of them. Nothing in the app frames itself.
             */
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            /**
             * Marginal and free. Every response declares its own type, so the
             * one place it bites is a file: `/api/export/*` and `/api/metrics`
             * hand back a CSV whose first cell a rep typed.
             */
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            /**
             * Kladra puts record ids in the address on purpose — `?open=`,
             * `?rep=`, `?q=` — and a search term is a customer's name. The
             * browser default already strips the path cross-origin; this makes
             * it exact, and costs nothing, since the app links nowhere off its
             * own origin.
             */
            key: "Referrer-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
