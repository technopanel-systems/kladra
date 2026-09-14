import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AcknowledgeLeadButton } from "@/components/leads/acknowledge-lead-button";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Prose } from "@/components/ui-ext/prose";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/authz";
import { holdsFloor, mayWrite } from "@/lib/floor";
import { leadsWaitingFor } from "@/lib/leads";

/**
 * The leads given to this person that he has not acknowledged, above his
 * companies (SPEC §3 P13: "The rep receives it apart from his own companies,
 * newest first, highlighted until he acknowledges").
 *
 * Apart, because a customer somebody else found and handed him is not yet one
 * of his: it is a promise that somebody will ring, and it sits in its own band
 * with its own word until he says he has it. Newest first, because the question
 * he is asking at the top of his list is what has just arrived. Highlighted in
 * the amber of "somebody owes an answer" — the band, the ring round the
 * company's letter and the word on the badge, never the tone alone (DESIGN §6).
 *
 * Pressing Acknowledge is the only thing that takes a row off: opening the
 * drawer does not (D157), because what the person who filed it needs to know is
 * that the call has been taken. Then the row is an ordinary company of his, in
 * the list below, keeping its origin on its drawer.
 *
 * Nothing at all when nothing is waiting: an empty band above a list is a
 * heading to read past every morning. It reads its own rows, so the page above
 * it stays one element and its list, filters and defaults are somebody else's.
 * Only on the reader's own floor — a manager reading Faisal's companies is not
 * shown the leads waiting on the manager.
 */
export function LeadsBand({ rep }: { rep: string | null }) {
  if (rep) return null;
  return (
    // No skeleton: the band is usually absent, and a grey shape that then
    // vanishes is a jump in the list below it on every visit.
    <Suspense fallback={null}>
      <Band />
    </Suspense>
  );
}

async function Band() {
  const user = await requireUser();
  if (!holdsFloor(user.role)) return null;

  const [leads, t, locale] = await Promise.all([
    leadsWaitingFor(user.id),
    getTranslations(),
    getLocale(),
  ]);
  if (leads.length === 0) return null;

  // His to answer, asked with the rule the action asks: an admin viewing as him
  // is reading, not working (D42, P8.8).
  const answers = mayWrite(user, user.id);

  return (
    <section data-slot="leads-band" aria-labelledby="leads-band-title" className="flex flex-col gap-2">
      <h2 id="leads-band-title" className="text-sm font-medium">
        {t("leads.bandTitle")}{" "}
        <span dir="ltr" className="num text-muted-foreground">
          {leads.length}
        </span>
      </h2>

      {/* One layout in both languages (P13-G6): the lead's own words first,
          then Acknowledge — at the inline end of the card on a desk, and under
          the words on a phone, at the same end, where the thumb is. Nothing
          about it wraps by width, so a longer English line cannot move the
          button to a different place from the Arabic one. */}
      <ul className="flex flex-col gap-2">
        {leads.map((lead) => (
          <li
            key={lead.id}
            data-lead={lead.id}
            className="row-door flex flex-col gap-3 rounded-xl border border-line bg-state-wait p-3 md:flex-row md:items-center md:gap-4 md:p-4"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Avatar id={lead.id} name={lead.name} kind="company" ring="wait" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    data-door
                    href={`/companies?open=${lead.id}`}
                    scroll={false}
                    aria-label={t("companies.openCompany", { name: lead.name })}
                    className="flex min-w-0 items-center gap-2 font-medium"
                  >
                    <Clip text={lead.name} />
                    <LinkPending />
                  </Link>
                  <StateBadge tone="wait">{t("leads.notAcknowledged")}</StateBadge>
                </div>
                {/* What the customer asked for, in the finder's words: a line,
                    so it starts where the row starts (rules/words.md). */}
                <Prose line text={lead.query} className="text-sm text-muted-foreground" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Avatar id={lead.fromId} name={lead.fromName} size="sm" />
                    {t("leads.fromPersonShort", { name: lead.fromName })}
                  </span>
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
                  <span>
                    <span className="sr-only">{t("leads.givenOn")} </span>
                    <DayText day={lead.givenOn} locale={locale} />
                  </span>
                  {lead.city ? (
                    // The dot and the city wrap together, so a city never
                    // starts a line with nothing to say what it follows.
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden="true" className="text-faint">
                        ·
                      </span>
                      <bdi>{lead.city}</bdi>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {answers ? (
              // Lifted over the row's door, so pressing it acknowledges rather
              // than opening the drawer (globals.css, row-door).
              <div className="relative z-10 flex shrink-0 justify-end">
                <AcknowledgeLeadButton companyId={lead.id} companyName={lead.name} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
