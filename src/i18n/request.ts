import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { isolateMessages } from "./isolate";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

const cache = new Map<string, Messages>();

/**
 * Messages live in messages/<locale>/<namespace>.json — one file per feature so
 * parallel work never collides on one JSON. They are merged here; the namespace
 * is the file name (messages/en/companies.json → t("companies.title")).
 */
export function loadMessages(locale: string): Messages {
  const cached = cache.get(locale);
  if (cached && process.env.NODE_ENV === "production") return cached;
  const dir = join(process.cwd(), "messages", locale);
  const merged: Messages = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const ns = file.slice(0, -5);
    merged[ns] = isolateMessages(JSON.parse(readFileSync(join(dir, file), "utf8")));
  }
  cache.set(locale, merged);
  return merged;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: loadMessages(locale),
    timeZone: "Asia/Riyadh",
    now: new Date(),
  };
});
