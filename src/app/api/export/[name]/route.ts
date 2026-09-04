import { NextResponse } from "next/server";
import { getUser } from "@/lib/authz";
import { buildExport, isExportName } from "@/lib/export";
import { todayRiyadh } from "@/lib/dates";

/**
 * The admin's three CSV files (SPEC §3: admin only, D19).
 *
 * A route handler rather than a server action, because the answer IS the file:
 * a browser downloading it needs a response with its own content type and a
 * filename, which an action cannot give. Everything else in the app writes
 * through an action; this reads and hands back bytes.
 *
 * `Content-Disposition` carries the day in the name, so three downloads a month
 * apart do not overwrite each other in the Downloads folder.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getUser();
  // Admin only, checked here and not only in the menu: a route handler is a URL
  // anybody signed in could type (§3).
  if (!user || user.role !== "admin") {
    return new NextResponse(null, { status: 404 });
  }

  const { name } = await params;
  if (!isExportName(name)) return new NextResponse(null, { status: 404 });

  const body = await buildExport(name);

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kladra-${name}-${todayRiyadh()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
