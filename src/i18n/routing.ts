import { defineRouting } from "next-intl/routing";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  localeCookie: { name: "locale", maxAge: 60 * 60 * 24 * 365 },
});

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "ar";
}

export function dirOf(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
