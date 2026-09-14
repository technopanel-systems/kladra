"use client";

/**
 * The last boundary, above the root layout. Nothing has been loaded when it
 * renders — no stylesheet, no messages, no theme cookie read — so everything
 * it needs is in this file. It is the offline splash's twin
 * (public/offline.html): dark, both languages on one page because there is no
 * locale to ask for, one thing to press. It should never be seen; it exists
 * so that on the day the root layout itself throws, the screen is still
 * Kladra's and not the browser's.
 *
 * With no stylesheet there are no tokens to name, so the dark theme's values
 * are written out here — and they are THE values, copied from globals.css, not
 * a near miss: the button wore `#f2566b → #ff7a4a` with dark ink, a third
 * spelling of the one primary gradient (DESIGN §1: there are exactly two). The
 * sizes are the scale's: 15.5 and 14.5 for `text-base` and `text-sm`, 12 for
 * `--radius`.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#12100e",
          color: "#ece9e5",
          fontFamily: '"IBM Plex Sans", "Noto Sans Arabic", ui-sans-serif, system-ui, "Segoe UI", sans-serif',
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            maxWidth: "34ch",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "grid",
              width: 56,
              height: 56,
              placeItems: "center",
              borderRadius: 12,
              background: "#b95651",
              color: "#fff",
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            K
          </span>
          <p lang="en" style={{ margin: 0, fontSize: 14.5 }}>
            Kladra could not draw this screen.
          </p>
          <p
            lang="ar"
            dir="rtl"
            style={{
              margin: 0,
              fontSize: 14.5,
              fontFamily: '"IBM Plex Sans", "Noto Sans Arabic", ui-sans-serif, system-ui, sans-serif',
            }}
          >
            تعذّر على كلادرا عرض هذه الشاشة.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: 8,
              padding: "8px 12px",
              // --brand and --brand-ink, dark theme: flat, as the Button is.
              background: "#b95651",
              color: "#ffffff",
              font: "inherit",
              fontSize: 13.5,
              fontWeight: 500,
            }}
          >
            <span lang="en">Try again</span>
            <span aria-hidden="true"> · </span>
            <span lang="ar" dir="rtl">
              إعادة المحاولة
            </span>
          </button>
        </div>
      </body>
    </html>
  );
}
