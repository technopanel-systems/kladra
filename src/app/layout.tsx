import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { DirectionProvider } from "@/components/direction-provider";
import { Toaster } from "@/components/ui/sonner";
import { dirOf } from "@/i18n/routing";
import { getTheme } from "@/lib/theme";
import "./globals.css";

// Static families: weights listed explicitly. Arabic gets its own family and
// the per-locale switch is one CSS variable on <html> (see globals.css).
const plexLatin = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-latin",
  display: "swap",
});
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});
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
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0d0c" },
    { media: "(prefers-color-scheme: light)", color: "#f5f2ef" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  const dir = dirOf(locale);
  return (
    <html
      lang={locale}
      dir={dir}
      data-theme={theme}
      className={`${plexLatin.variable} ${plexArabic.variable} ${plexMono.variable} ${theme === "dark" ? "dark" : ""} min-h-full antialiased`}
      style={{ ["--font-app" as string]: locale === "ar" ? "var(--font-arabic)" : "var(--font-latin)" }}
      suppressHydrationWarning
    >
      <body className="min-h-svh">
        <NextIntlClientProvider>
          <DirectionProvider dir={dir}>
            {children}
            <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} />
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
