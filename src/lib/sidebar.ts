/**
 * The rail's width, remembered per browser (the theme's reasoning, SPEC D16:
 * a laptop and a shared desk machine want different widths).
 *
 * A cookie and not localStorage, because the server has to know it: the first
 * paint of a collapsed rail used to be an expanded one, followed by a snap
 * when the browser read what it had saved (§5 #40). The browser writes it,
 * `(app)/layout.tsx` reads it, and the first byte of HTML is already the right
 * width. Nothing in it is secret, so it is not httpOnly.
 *
 * No server imports here on purpose: the hook in the browser and the layout on
 * the server both name the cookie from this one file.
 */
export const SIDEBAR_COOKIE = "sidebar";

export type SidebarWidth = "collapsed" | "expanded";

export function sidebarCollapsed(value: string | null | undefined): boolean {
  return value === "collapsed";
}
