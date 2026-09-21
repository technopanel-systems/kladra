import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { DirectionProvider } from "@/components/direction-provider";
import { Hydrated } from "@/components/shell/hydrated";
import { ServiceWorker } from "@/components/shell/service-worker";
import { Toasts } from "@/components/shell/toasts";
import { LinkPendingAnnouncer } from "@/components/ui-ext/link-pending";
import { dirOf } from "@/i18n/routing";
import { CANVAS, getTheme } from "@/lib/theme";
import "./globals.css";

// Two faces, one voice (DESIGN §1, P13-G6): IBM Plex Sans for Latin and Noto
// Sans Arabic for Arabic. Plex's own Arabic was the first choice and was drawn
// small: set beside Plex Latin at 13.5px an Arabic company name read a size
// below the English one on the same line, which is the legibility rule this
// scale exists for. Noto Sans Arabic stands at the Latin's height and weight.
// The stack names Latin first; a browser takes each Arabic letter from the
// second (globals.css `--font-sans` says why by name, not by variable). Nothing on a screen is bolder than 600 (P11I, D133). Figures are the
// Latin face in tabular digits (`num`), not a monospace.
const plexLatin = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
});
/*
 * Noto Sans Arabic from our own file rather than Google's, and a quarter of the
 * size: 37 kB where Google's was 162 kB, on every cold load of every screen in
 * both locales, because an English screen is full of Arabic names (P14.5,
 * measured). Google serves one file whatever weights are asked for — all of
 * 100 to 900, and the letters of every language written in Arabic script — and
 * next/font can ask for nothing narrower. This one is the same face cut to the
 * weights Kladra draws (400 to 600, D133) and to the Arabic block, with its
 * joining and ligature rules whole, plus the presentation forms an old PDF
 * pastes in. Rendering at those weights is unchanged. Made with fontTools from
 * Google's file:
 *   fonttools varLib.instancer full.woff2 wght=400:600 -o clipped.ttf
 *   fonttools subset clipped.ttf --flavor=woff2 --layout-features='*'
 *     --unicodes=U+0020,U+00A0,U+0600-06FF,U+200C-200F,U+2010-2011,U+25CC,U+FE70-FEFF
 * The name is declared so the stack in globals.css finds it by name, as it did.
 * SIL Open Font License, beside the file.
 */
const notoArabic = localFont({
  src: "./fonts/noto-sans-arabic.woff2",
  weight: "400 600",
  variable: "--font-arabic",
  display: "swap",
  declarations: [
    { prop: "font-family", value: "Noto Sans Arabic" },
    { prop: "unicode-range", value: "U+0600-06FF, U+200C-200F, U+2010-2011, U+25CC, U+FE70-FEFF" },
  ],
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
      className={`${plexLatin.variable} ${notoArabic.variable} ${theme === "dark" ? "dark" : ""} min-h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-svh">
        <NextIntlClientProvider>
          <DirectionProvider dir={dir}>
            <Hydrated />
            <ServiceWorker />
            {children}
            {/* Outside the app's own tree on purpose: a live region inside it
                keeps its ancestors in reach of a screen reader behind an open
                drawer (link-pending.tsx says how). */}
            <LinkPendingAnnouncer />
            <Toasts dir={dir} />
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
