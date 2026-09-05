import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CallsLine, DayBoard, MovedLine } from "@/components/reports/day-figures";
import { Prose } from "@/components/ui-ext/prose";
import { movedNothing } from "@/lib/report-figures";
import type { PersonDay } from "@/lib/reports";

/**
 * One person's day, as everybody else reads it (SPEC D56, D57).
 *
 * What moved is on one line, and under it the sentence that person wrote. In
 * that order because the figures are the context and the sentence is the point:
 * a manager scrolling eleven of these in the evening is reading the sentences
 * and glancing at the numbers, not the other way round.
 *
 * There is no badge, no icon and no colour on a day nobody wrote. Jerom asked
 * for a missed day to be visible without being a punishment, and the honest way
 * to do that is to leave the space where the sentence goes empty and outlined —
 * a form with a blank in it, not a person with a mark against him. The figures
 * stay: the system still saw the work, and it says so. What is missing is the
 * half only he could have written.
 */
export async function PersonCard({ person, open }: { person: PersonDay; open: boolean }) {
  const t = await getTranslations("reports");
  const tc = await getTranslations("common");

  return (
    <article
      data-slot="report-card"
      data-state={person.state}
      className="card-face flex flex-col gap-2.5 p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 font-medium break-words">
          <bdi>{person.name}</bdi>
        </h3>
        <span className="text-xs text-muted-foreground">{tc(person.role)}</span>
      </header>

      {/* "Nothing was recorded on this day" is said on exactly one kind of day:
          a finished working day with nothing on it and nothing written. Anywhere
          else it stutters against the line underneath it — over a paragraph
          about the day it contradicts what it sits above, over "Weekend" it
          reports that nothing happened at the weekend, and at nine in the
          morning it says a day is empty that has not started. Each of those
          teaches somebody to stop reading a screen. */}
      {movedNothing(person.work) ? (
        person.state === "silent" ? <p className="text-sm text-faint">{t("quietDay")}</p> : null
      ) : (
        <>
          <MovedLine work={person.work} />
          <CallsLine work={person.work} open={open} />
        </>
      )}

      <Note person={person} />
    </article>
  );
}

/** The sentence, or the reason there is not one. */
async function Note({ person }: { person: PersonDay }) {
  const t = await getTranslations("reports");

  if (person.note) return <Prose slot="report-note" text={person.note} className="text-sm" />;

  if (person.state === "silent") {
    return (
      <p
        data-slot="report-missing"
        className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted-foreground"
      >
        {t("stateSilent")}
      </p>
    );
  }

  const key =
    person.state === "open"
      ? "stateOpen"
      : person.off === "holiday"
        ? "stateHoliday"
        : person.off === "leave"
          ? "stateLeave"
          : "stateWeekend";

  return (
    <p data-slot="report-state" className="text-sm text-faint">
      {t(key)}
    </p>
  );
}

/**
 * The card of the person reading it — the only one with a box in it.
 *
 * It shows the whole day rather than only what moved, noughts included: he is
 * checking it against his own memory before he writes, and a nought he did not
 * expect is exactly the thing worth catching before six o'clock.
 */
export async function OwnCard({
  person,
  open,
  children,
}: {
  person: PersonDay;
  open: boolean;
  /** The write box. */
  children: ReactNode;
}) {
  const t = await getTranslations("reports");

  return (
    // No ring, no tint. The brand red and the "something went wrong" red are the
    // same #c8102e in light mode (globals.css), so a brand-coloured ring round
    // this card said "alert" in the app's own colour vocabulary while meaning
    // "yours". The heading, the fuller grid and the box under it say that
    // already, and colour keeps the one job DESIGN §6 gives it.
    <section data-slot="report-own" className="card-face flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{t("yourDay")}</h2>
      <DayBoard work={person.work} />
      <CallsLine work={person.work} open={open} />
      {children}
    </section>
  );
}
