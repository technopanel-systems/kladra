import { getTranslations } from "next-intl/server";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Link } from "@/i18n/navigation";
import type { Waiting } from "@/lib/day";

/**
 * What has come back to this rep and is stopped until he does something
 * (SPEC §3, P8).
 *
 * It is first on the screen, above the calls, because every row here is a
 * customer already waiting: a quotation the coordinator sent back, a dispatch
 * she refused, a quotation the customer is sitting on. Each row carries the
 * reason in her own words, so a rep does not have to open it to know whether
 * this is a two-minute fix or a phone call (S53).
 */
export async function WaitingList({ rows }: { rows: Waiting[] }) {
  const t = await getTranslations();

  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("day.waitingOnYou")}</h2>
        <p className="card-face px-4 py-6 text-center text-sm text-muted-foreground">
          {t("day.nothingWaiting")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t("day.waitingOnYou")}{" "}
        <span dir="ltr" className="num text-muted-foreground">
          {rows.length}
        </span>
      </h2>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={`${row.reasonKey}-${row.id}`}>
            <Link
              href={row.href}
              className="card-face flex flex-col gap-1.5 p-3 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span dir="ltr" className="num font-medium">
                  {row.label}
                </span>
                {/* Sent back and refused are somebody waiting on HIM; a
                    quotation with the customer is out in the world (DESIGN §6). */}
                <StateBadge tone={row.reasonKey === "day.withCustomer" ? "open" : "wait"}>
                  {t(row.reasonKey)}
                </StateBadge>
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <bdi className="truncate">{row.companyName}</bdi>
                {row.projectName ? (
                  <>
                    <span aria-hidden="true" className="text-faint">
                      ·
                    </span>
                    <bdi className="truncate text-muted-foreground">{row.projectName}</bdi>
                  </>
                ) : null}
              </span>
              {row.reason ? (
                <span className="text-xs text-muted-foreground">{row.reason}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
