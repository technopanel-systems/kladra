import { getLocale, getTranslations } from "next-intl/server";
import { LookupsPanel } from "@/components/admin/lookups-panel";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { listLookup } from "@/lib/admin";
import { isLookupKind, LOOKUP_KINDS, type LookupKind } from "@/lib/lookup-kinds";

/**
 * The reference lists (SPEC §3, D1, D3, D21).
 *
 * Which list is in the URL, so a refresh and a shared link land on the same
 * one. Countries and cities are not here — ISO reference data, seeded, and
 * which few are pinned at the top is a design decision rather than an opinion
 * about the world (D39).
 */
type Search = { list?: string };

export default async function AdminLookupsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  if (user.role !== "admin") redirect({ href: homeFor(user.role), locale: await getLocale() });

  const kind: LookupKind = isLookupKind(params.list) ? params.list : LOOKUP_KINDS[0];
  const [t, rows] = await Promise.all([getTranslations(), listLookup(kind)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.lookups")}</h1>
      <LookupsPanel kind={kind} rows={rows} />
    </div>
  );
}
