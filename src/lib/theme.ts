import { cookies } from "next/headers";

/**
 * Theme is a cookie read on the SERVER, so the palette is in the first byte of
 * HTML — no flash, no inline script, no next-themes. Dark is the default.
 * Cost: reading a cookie in the root layout makes the whole tree dynamic.
 */
export const THEME_COOKIE = "theme";
export type Theme = "dark" | "light";

/**
 * The canvas of each theme, for the places that need it as a value rather than
 * a class: the browser's own chrome (`generateViewport` in the root layout) and
 * the installed app's splash (`manifest.ts`). The same two numbers live in
 * three more places that cannot import this file — globals.css (`--canvas`),
 * public/offline.html (no bundler) and src/app/global-error.tsx (no stylesheet
 * and no server) — so a change here is a change in four files, on purpose
 * named here so none is missed.
 */
export const CANVAS: Record<Theme, string> = { dark: "#0f0d0c", light: "#f5f2ef" };

export function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "dark";
}
