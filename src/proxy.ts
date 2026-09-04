import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale routing only. Auth is checked in the (app) layout, where the session
// is read once per request; the api routes are excluded below.
export default createMiddleware(routing);

export const config = {
  // Everything except /api, Next's internals, and paths carrying a file
  // extension.
  //
  // The dot is written as a character class ON PURPOSE. Written "\." inside a
  // double-quoted string the backslash is not a recognised escape, so the
  // string is just ".", the alternative becomes ".*..*" — which matches any
  // path of one character or more — and the negative lookahead then fails for
  // EVERY route except "/". The middleware silently stops running: no locale
  // header, so getLocale() falls back to "en", and because next-intl's config
  // is React-cached on that first call, a later setRequestLocale("ar") cannot
  // correct it. Result: every Arabic screen renders left-to-right in English,
  // with no error anywhere. Use [.] (or "\\.") and never a bare "\.".
  matcher: ["/((?!api|_next|_vercel|.*[.].*).*)"],
};
