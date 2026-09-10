import { getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/activities/activity-list";
import { ListTail } from "@/components/ui-ext/list-tail";
import type { DayTrail as Trail } from "@/lib/reports";

/**
 * The log a person wrote that day, on the card that reports the day (S27).
 *
 * S27 is the founder's own sentence — "the history of a company is the
 * manager's daily report" — and Kladra had held the two halves apart since P3.
 * The entries lived on each customer's drawer, where only somebody already
 * looking at that customer would find them; the report card said "4 log
 * entries" and named none of the four. So the manager read a number, and the
 * rep at six o'clock wrote out in the report box what he had already typed
 * during the day. That retyping is the second copy S26 forbids by name, and it
 * is what turns a daily report from a habit into a chore.
 *
 * No heading over it. The figure line directly above already says "4 log
 * entries", the glossary keeps "log entry" for exactly this and "daily report"
 * for the sentence, and a heading here would say the same three words twice on
 * one card. Each entry says what it is on its own line.
 *
 * It renders nothing on a day with no entries: the figures above it already say
 * the day was quiet, and an empty list under them says it again in more words.
 */
export async function DayTrail({
  trail,
  correct = false,
}: {
  trail: Trail | null;
  /**
   * Offered on the reader's OWN card and nowhere else (D70). A rep at six
   * o'clock reading his day is the person most likely to notice that one entry
   * went against the wrong customer, and until now the only way to fix it was
   * to remember which customer he had been looking at and go back there. The
   * entry itself knows, so the fix is offered where the mistake is seen.
   */
  correct?: boolean;
}) {
  if (!trail || trail.rows.length === 0) return null;
  const t = await getTranslations("reports");

  return (
    <div data-slot="day-trail" className="flex flex-col gap-2">
      <ActivityList context="day" activities={trail.rows} correct={correct} />
      {/* Not the list's usual sentence: that one says to search, and this card
          has no search box. The rest of a day is under Activity on each
          customer, which is where it has always been (S27). */}
      <ListTail
        shown={trail.rows.length}
        total={trail.total}
        hint={t("trailTail", { shown: trail.rows.length, total: trail.total })}
      />
    </div>
  );
}
