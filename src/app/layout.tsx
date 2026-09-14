import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Readex_Pro } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { DirectionProvider } from "@/components/direction-provider";
import { Hydrated } from "@/components/shell/hydrated";
import { ServiceWorker } from "@/components/shell/service-worker";
import { Toaster } from "@/components/ui/sonner";
import { dirOf } from "@/i18n/routing";
import { CANVAS, getTheme } from "@/lib/theme";
import "./globals.css";

// One family for both scripts (DESIGN §1, P13-S1): Readex Pro was drawn for
// Arabic and Latin together, so a Latin company name inside an Arabic row sits
// at the same height and weight as the words around it, and the locale switch
// changes the words and nothing about the voice. The variable file rather than
// three static weights: one file per script covers 400–600, and nothing on a
// screen is bolder than 600 (P11I, D133).
const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  variable: "--font-app",
  display: "swap",
});
// Every money and m² figure stays in a monospace of its own: those stand in
// columns that must line up (DESIGN §2).
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Kladra", template: "%s · Kladra" },
  description: "Technopanel CRM",
  applicationName: "Kladra",
  manifest: "/manifest.webmanifest",
  // iOS reads none of the manifest's icons; it wants this link tag, and it
  // paints black behind anything transparent — so that file is full bleed
  // (scripts/icons.ts).
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Kladra", statusBarStyle: "black-translucent" },
};

/**
 * The browser's own chrome — the address bar on a phone, the title bar of an
 * installed window — follows Kladra's theme, not the phone's. `themeColor` was
 * a pair of media queries on the operating system's setting, so a rep who had
 * chosen light on a dark phone got a black bar over a white page (§5 #41). The
 * same cookie the layout below reads decides it.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return {
    themeColor: CANVAS[theme],
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  const dir = dirOf(locale);
  return (
    <html
      lang={locale}
      dir={dir}
      // Never machine-translated (P13-S11, DESIGN §5). Kladra is written in both
      // languages and switches between them itself; a browser that translates
      // the page as well rewrites text React owns. Edge set to "always translate
      // Arabic" was measured doing it to the Arabic screens: text rewritten in
      // place, React's own text nodes taken out for <font> wrappers, `direction:
      // ltr` stamped on what it touched, hydration failing on the day screen, and
      // the report popup's customer picker still reading its translated
      // placeholder after a customer had been chosen. On a page treated the way
      // Chromium's translator treats one, a Select given a new value took the
      // screen down the next time it was opened. It also translates what must
      // never be — a customer's name. On <html> so it covers the popups too: every
      // menu, list and dialog is portalled into <body>, outside any wrapper
      // further down, and the attribute is inherited.
      translate="no"
      data-theme={theme}
      className={`${readex.variable} ${plexMono.variable} ${theme === "dark" ? "dark" : ""} min-h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-svh">
        <NextIntlClientProvider>
          <DirectionProvider dir={dir}>
            <Hydrated />
            <ServiceWorker />
            {children}
            <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} />
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
