import { getLocale, getTranslations } from "next-intl/server";
import { DayText } from "@/components/ui-ext/day-text";
import { Link } from "@/i18n/navigation";
import { NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { TONE_TEXT } from "@/lib/state-tone";
import type { Stuck } from "@/lib/team";
import { cn } from "@/lib/utils";

/**
 * What is waiting longer than it should be (SPEC D14).
 *
 * Four questions, each with its own window: a quotation request more than two
 * WORKING days on the coordinator's desk, a follow-up more than three days past
 * its date, a company added more than fourteen days ago and never contacted, and
 * a customer somebody DID contact and then dropped — no next step anywhere on
 * him and nothing logged for a fortnight (D63). That last one is the biggest of
 * the four and was invisible until P9.4: it is on no band of any screen, because
 * every band this app had was keyed on a date and these have none.
 *
 * Working days for the first one because a request raised on a Thursday is not
 * late on Sunday, and a rep back from Eid must not be told he is behind (S48).
 *
 * Every row goes somewhere. A list of problems nobody can act on from is a list
 * people stop reading (S52 — a reminder is cleared by doing the work).
 *
 * Empty is the good state and says so, rather than showing three empty
 * headings, which reads as a screen that failed to load.
 */
export async function StuckList({ stuck }: { stuck: Stuck }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const nothing =
    stuck.requests.length === 0 &&
    stuck.followUps.length === 0 &&
    stuck.neverContacted.length === 0 &&
    stuck.goneQuiet.length === 0;

  if (nothing) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("team.stuck")}</h2>
        <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
          {t("team.stuckNothing")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">{t("team.stuck")}</h2>

      {stuck.requests.length > 0 ? (
        <Group title={t("team.stuckRequests")}>
          {stuck.requests.map((row) => (
            <Row
              key={row.id}
              href={`/quotations?open=${row.id}`}
              name={
                <>
                  <span dir="ltr" translate="no" className="num">
                    {row.label}
                  </span>{" "}
                  · <bdi>{row.companyName}</bdi>
                </>
              }
              who={row.repName}
              note={t("team.waitingDays", { count: row.workingDaysWaiting })}
            />
          ))}
        </Group>
      ) : null}

      {stuck.followUps.length > 0 ? (
        <Group title={t("team.stuckFollowUps")}>
          {stuck.followUps.map((row) => (
            <Row
              key={`${row.kind}-${row.id}`}
              href={
                row.kind === "company"
                  ? `/companies?open=${row.id}`
                  : `/projects?open=${row.id}`
              }
              name={
                row.kind === "company" ? (
                  row.name
                ) : (
                  <>
                    <bdi>{row.name}</bdi> · <bdi>{row.companyName}</bdi>
                  </>
                )
              }
              who={row.repName}
              note={
                <>
                  <DayText day={row.day} locale={locale} />
                  {" · "}
                  {t("team.overdueDays", { count: row.daysOverdue })}
                </>
              }
            />
          ))}
        </Group>
      ) : null}

      {stuck.goneQuiet.length > 0 ? (
        <Group
          title={t("team.stuckQuiet")}
          means={t("common.quietMeans", { days: NEVER_CONTACTED_DAYS })}
        >
          {stuck.goneQuiet.map((row) => (
            <Row
              key={row.id}
              href={`/companies?open=${row.id}`}
              name={row.name}
              who={row.repName}
              note={t("team.quietDays", { count: row.days })}
            />
          ))}
        </Group>
      ) : null}

      {stuck.neverContacted.length > 0 ? (
        <Group title={t("team.stuckNever")}>
          {stuck.neverContacted.map((row) => (
            <Row
              key={row.id}
              href={`/companies?open=${row.id}`}
              name={row.name}
              who={row.repName}
              note={t("team.addedDays", { count: row.days })}
            />
          ))}
        </Group>
      ) : null}
    </section>
  );
}

function Group({
  title,
  means,
  children,
}: {
  title: string;
  /** The rule behind the group, where its name does not carry it (D59). */
  means?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-xs font-medium text-faint">{title}</h3>
        {means ? <p className="text-xs text-muted-foreground">{means}</p> : null}
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function Row({
  href,
  name,
  who,
  note,
}: {
  href: string;
  name: React.ReactNode;
  who: string;
  note: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="card-face flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0 flex-1 text-sm">{name}</span>
        <span className="text-xs text-muted-foreground">{who}</span>
        <span className={cn("text-xs", TONE_TEXT.wait)}>{note}</span>
      </Link>
    </li>
  );
}
