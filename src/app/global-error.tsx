"use client";

/**
 * The last boundary, above the root layout. Nothing has been loaded when it
 * renders — no stylesheet, no messages, no theme cookie read — so everything
 * it needs is in this file. It is the offline splash's twin
 * (public/offline.html): dark, both languages on one page because there is no
 * locale to ask for, one thing to press. It should never be seen; it exists
 * so that on the day the root layout itself throws, the screen is still
 * Kladra's and not the browser's.
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
          background: "#0f0d0c",
          color: "#f3eeeb",
          fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif',
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
              borderRadius: 16,
              background: "linear-gradient(140deg, #e5233c, #7a1020)",
              color: "#fff",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            K
          </span>
          <p lang="en" style={{ margin: 0, fontSize: 15 }}>
            Kladra could not draw this screen.
          </p>
          <p
            lang="ar"
            dir="rtl"
            style={{
              margin: 0,
              fontSize: 15,
              fontFamily: '"IBM Plex Sans Arabic", ui-sans-serif, system-ui, sans-serif',
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
              borderRadius: 10,
              padding: "8px 14px",
              background: "linear-gradient(135deg, #f2566b, #ff7a4a)",
              color: "#1a0a0c",
              font: "inherit",
              fontSize: 14,
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
