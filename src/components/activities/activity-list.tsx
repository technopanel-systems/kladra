import { Ellipsis, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DayText } from "@/components/ui-ext/day-text";
import { Prose } from "@/components/ui-ext/prose";

/**
 * The log, newest first (SPEC S24/S27 — a company's history is the manager's
 * daily report, so it has to read like a story, not a table).
 *
 * Ordering belongs to the query, never to the screen: this renders the rows in
 * the order it is handed. The channel is a small NEUTRAL badge — DESIGN §1 says
 * status is a word, not a colour, and §4 rules out a colour-per-status map.
 *
 * Shared, not client-only: rendered from the company drawer it stays on the
 * server; a client parent (the project drawer) gets the same component through
 * the client build of next-intl's hooks.
 */

export type ActivityChannel = "visit" | "call" | "whatsapp" | "other";

export type ActivityEntry = {
  id: string;
  text: string;
  channel: ActivityChannel;
  /** A Riyadh day, "YYYY-MM-DD". */
  happenedOn: string;
  /** Who wrote it, as a name. Never a user id. */
  userName: string;
  contactName?: string | null;
  projectName?: string | null;
};

const CHANNEL_ICON = {
  visit: MapPin,
  call: Phone,
  whatsapp: MessageCircle,
  other: Ellipsis,
} as const;

export function ActivityList({
  activities,
  empty = null,
}: {
  activities: readonly ActivityEntry[];
  /** Shown instead of the list: one sentence and its primary action. */
  empty?: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();

  if (activities.length === 0) return <>{empty}</>;

  return (
    <ol className="flex flex-col gap-2">
      {activities.map((entry) => {
        const Icon = CHANNEL_ICON[entry.channel];
        const named = entry.contactName || entry.projectName;
        return (
          <li key={entry.id} className="card-face flex flex-col gap-1.5 p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="secondary" className="gap-1">
                <Icon aria-hidden="true" />
                {t(`common.${entry.channel}`)}
              </Badge>
              <DayText
                day={entry.happenedOn}
                locale={locale}
                className="text-xs text-muted-foreground"
              />
              <span className="text-xs text-faint">
                {t("common.by", { name: entry.userName })}
              </span>
            </div>

            {/* His words, in his direction, whichever page it is on. */}
            <Prose text={entry.text} className="text-sm" />

            {named ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {entry.contactName ? (
                  <span>
                    <span className="sr-only">{t("common.contact")}: </span>
                    {entry.contactName}
                  </span>
                ) : null}
                {entry.contactName && entry.projectName ? (
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
                ) : null}
                {entry.projectName ? (
                  <span>
                    <span className="sr-only">{t("common.project")}: </span>
                    {entry.projectName}
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
