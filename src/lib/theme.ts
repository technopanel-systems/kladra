import { cookies } from "next/headers";

/**
 * Theme is a cookie read on the SERVER, so the palette is in the first byte of
 * HTML — no flash, no inline script, no next-themes. Dark is the default.
 * Cost: reading a cookie in the root layout makes the whole tree dynamic.
 */
export const THEME_COOKIE = "theme";
export type Theme = "dark" | "light";

export function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "dark";
}
