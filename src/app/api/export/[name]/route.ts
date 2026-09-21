import { NextResponse } from "next/server";
import { getUser } from "@/lib/authz";
import { buildExport, isExportName, mayExport } from "@/lib/export";
import { todayRiyadh } from "@/lib/dates";
import { isLocale } from "@/i18n/routing";

/**
 * A file, built from the screen that asked for it (SPEC §3, P14 14.10).
 *
 * A route handler rather than a server action, because the answer IS the file:
 * a browser downloading it needs a response with its own content type and a
 * filename, which an action cannot give. Everything else in the app writes
 * through an action; this reads and hands back bytes.
 *
 * **It carries the screen's own address.** The query string a list screen holds
 * its state in — `?q=`, `?filter=`, `?status=`, `?rep=` — is handed straight to
 * the builder, which reads it with the same parsers the screen reads it with.
 * That is the founder's "each export carries the filters of the screen it came
 * from", and it is why a file cannot quietly hold rows the list did not show.
 *
 * **And the reader's language.** A route handler has no locale prefix, so the
 * screen sends its own; anything else falls back to the language the person
 * signed in with. A file in the wrong language is not a small thing here — the
 * column headings, the statuses and the category names are all words.
 *
 * Who may ask is the screen's question and not this file's: the builders narrow
 * to the reader's own rows, and the few files that are nobody's own screen say
 * so in the registry (`mayExport`). D19's "admin only" was a rule about the
 * panel those three files used to live on.
 *
 * `Content-Disposition` carries the day in the name, so three downloads a month
 * apart do not overwrite each other in the Downloads folder.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getUser();
  // Signed in, checked here and not only in the menu: a route handler is a URL
  // anybody could type (§3).
  if (!user) return new NextResponse(null, { status: 404 });

  const { name } = await params;
  if (!isExportName(name) || !mayExport(name, user)) {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const asked = url.searchParams.get("locale");
  const locale = isLocale(asked ?? undefined) ? asked! : user.locale;

  const body = await buildExport(name, { user, locale, params: url.searchParams });

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kladra-${name}-${todayRiyadh()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
