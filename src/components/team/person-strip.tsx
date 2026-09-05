import { getTranslations } from "next-intl/server";
import { Sqm } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import type { PersonStanding } from "@/lib/standing";

/**
 * How a person's floor is standing (D78, P10a).
 *
 * A company has had this band since P8.5 and so has a project; the person in
 * between them never did. The manager could read a rep's month, and then a list
 * of his companies, and nothing in between said what was actually in play —
 * that lived one screen back, in a row of the team table, which is where he had
 * come from.
 *
 * Three figures and no fourth. What is still out there to win, what is in play
 * right now, and what has stopped on him. The month above it answers "how much
 * has he moved", and the follow-up strip below answers "whose call is due", so
 * this is the middle question and only that.
 *
 * The same band renders on his own floor, unlabelled by person, for the reason
 * the month card does: a rep should recognise the row the manager reads as the
 * card on his own screen, and two layouts for one set of facts is how two
 * readings of one figure begin (D59).
 */
export async function PersonStrip({ standing }: { standing: PersonStanding }) {
  const t = await getTranslations();

  return (
    <StandingStrip
      items={[
        {
          label: t("team.pipeline"),
          value: <Sqm value={standing.pipelineSqm} />,
          caption: t("team.pipelineMeans"),
        },
        {
          label: t("team.openQuotations"),
          value: (
            <span dir="ltr" className="num">
              {standing.openQuotations}
            </span>
          ),
          // The part of the figure that is a phone call rather than a form
          // (D59): of six in play, the three the customer is holding are the
          // ones nobody here can move by working harder.
          caption: t("team.openWithCustomer", { count: standing.withCustomer }),
        },
        {
          label: t("team.sentBackOrRefused"),
          value: (
            <span dir="ltr" className="num">
              {standing.sentBack}
            </span>
          ),
          caption: t("team.sentBackOrRefusedMeans"),
          // Amber, and the same amber the badge on his day wears for the same
          // rows: it is work to redo, not an error anybody made.
          tone: standing.sentBack > 0 ? "wait" : null,
        },
      ]}
    />
  );
}
