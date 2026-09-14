"use client";

import { useCallback, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ruleDuplicateAction } from "@/actions/duplicates";
import { Avatar } from "@/components/ui-ext/avatar";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { DayText } from "@/components/ui-ext/day-text";
import { Ref } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { WaitedFor } from "@/components/ui-ext/waited-for";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { DuplicatePair, DuplicateSide } from "@/lib/duplicates";

/**
 * One pair, side by side, and the manager's three answers (P12-8).
 *
 * The two records are drawn identically — same fields, same order, same width —
 * because the decision is a comparison and a card that described one of them
 * better would be answering for him. What is on each is what he decides by:
 * who holds it, when it arrived, when anybody last wrote about it, and how much
 * work is already hanging off it.
 *
 * The answer is pressed ON the record it is about, so choosing which one
 * continues and saying what happens to the other is one act rather than a radio
 * button and a submit. The third answer belongs to neither record, so it sits
 * under both.
 *
 * **No answer is the brand button** (P13-G6, S12.8). "Keep this one" wore the
 * brand gradient on both sides of every pair, so a desk of three pairs was six
 * primary buttons, and the loudest thing on the screen was the same word twice,
 * pointing two ways. The brand says "this is the one thing to press" and here
 * there is no such thing until he has read both records. Keep this one is the
 * filled secondary, Keep and share and Not the same company are outlined, and
 * the choice is carried by the word on the button and the record it sits in —
 * the confirmation that follows is where the one brand press of the act lives.
 *
 * Each record leads with its face and its holder's (DESIGN §1b): the company a
 * rounded square and the rep round, both 24, the tint from their own ids, so
 * Faisal is the same colour here as on the team tab and a manager sees whose
 * floor each side is on before he reads a name.
 *
 * Every answer confirms first. Two of them move a whole customer's history from
 * one floor to another and none of the three can be pressed twice — the flag is
 * answered once, for ever (`duplicate_flags_pair_idx`) — which is exactly the
 * shape "are you sure" exists for.
 */
export type DuplicateRow = DuplicatePair & { waited: { days: number; late: boolean } };

export function DuplicateList({ rows }: { rows: DuplicateRow[] }) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <ul aria-label={t("duplicates.listLabel")} className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.id} data-slot="duplicate-pair" className="card-face flex flex-col gap-4 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* The evidence, and the reason this pair exists at all. The badge
                  is amber while the pair is young and red once it has waited
                  past the line — and the line under it says "late" in words,
                  because a hue is never the only thing saying so (DESIGN §5). */}
              <StateBadge tone={row.waited.late ? "bad" : "wait"}>
                {t("duplicates.sameNumber")}
              </StateBadge>
              {/* A number is always read left to right (rules/words.md). */}
              <Ref className="text-sm font-medium">{row.phone}</Ref>
            </span>
            <WaitedFor waited={row.waited} />
          </div>

          {/* One column each from `sm` up; stacked below it, older first, which
              is the order the sentence under the card reads them in. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Side pair={row} side={row.older} onDone={refresh} />
            <Side pair={row} side={row.newer} onDone={refresh} />
          </div>

          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" className="w-full sm:w-fit">
                {t("duplicates.notTheSame")}
              </Button>
            }
            title={t("duplicates.notTheSameTitle")}
            description={t("duplicates.notTheSameHint")}
            confirmLabel={t("duplicates.notTheSame")}
            successMessage={t("duplicates.notTheSameDone")}
            onConfirm={() => ruleDuplicateAction(row.id, "notDuplicate")}
            onDone={refresh}
          />
        </li>
      ))}
    </ul>
  );
}

/** One record of the pair, and the two answers that keep it. */
function Side({
  pair,
  side,
  onDone,
}: {
  pair: DuplicateRow;
  side: DuplicateSide;
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const other = side.id === pair.older.id ? pair.newer : pair.older;

  return (
    <div
      data-slot="duplicate-side"
      /*
       * Named, because the two sides of a pair carry the SAME two button
       * labels: somebody tabbing through hears "Keep this one" twice and, with
       * the name only visible above it, has nothing to tell them apart. The
       * group's name is the record, so each button is announced inside it.
       */
      role="group"
      aria-label={side.name}
      /*
       * An edge on the card's own surface, not the inset fill: the answer under
       * it is the filled secondary button, which is that fill, and a filled
       * button on a panel of the same colour is a word with no button round it.
       */
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-line p-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-start gap-2">
          <Avatar id={side.id} name={side.name} kind="company" size="sm" />
          {/* The name wraps: it is what the decision is about, and a pair of
              names cut to their first words is two records nobody can tell
              apart. */}
          <span className="min-w-0 font-medium break-words">
            <bdi>{side.name}</bdi>
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar id={side.repId} name={side.repName} size="sm" />
            <span className="min-w-0 break-words">
              <bdi>{side.repName}</bdi>
            </span>
          </span>
          {side.city ? (
            <>
              <span aria-hidden="true" className="text-faint">
                ·
              </span>
              <bdi>{side.city}</bdi>
            </>
          ) : null}
        </span>
      </div>

      <dl className="flex flex-col gap-1 text-xs">
        <Fact label={t("duplicates.addedOn")}>
          <DayText day={side.addedOn} locale={locale} />
        </Fact>
        <Fact label={t("duplicates.lastActivity")}>
          {side.lastActivityOn ? (
            <DayText day={side.lastActivityOn} locale={locale} />
          ) : (
            t("forms.duplicateNeverContacted")
          )}
        </Fact>
      </dl>

      {/* What would move if this record were not the one that continues, in the
          strip every drawer's figures stand in. The words are the app's
          existing names for the four things (D102).

          Two by two until the card is wide enough for four: a side is half a
          card from `sm` up, so four columns is under 75px each and «جهات
          الاتصال» would stand on three lines. The label wraps rather than
          truncating either way — a figure whose caption is an ellipsis is not
          a figure. */}
      <StandingStrip
        className="sm:grid-cols-2 lg:grid-cols-4"
        items={[
          { label: t("common.contacts"), value: <Count value={side.has.contacts} /> },
          { label: t("common.projects"), value: <Count value={side.has.projects} /> },
          { label: t("common.quotations"), value: <Count value={side.has.quotations} /> },
          { label: t("common.dispatches"), value: <Count value={side.has.dispatches} /> },
        ]}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <ConfirmDialog
          trigger={
            <Button variant="secondary" size="sm">
              {t("duplicates.keepThis")}
            </Button>
          }
          title={t("duplicates.keepTitle", { name: side.name })}
          description={t("duplicates.keepHint", { other: other.name, rep: other.repName })}
          confirmLabel={t("duplicates.keepThis")}
          successMessage={t("duplicates.keptDone", { name: side.name })}
          onConfirm={() => ruleDuplicateAction(pair.id, "kept", side.id)}
          onDone={onDone}
        />
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              {t("duplicates.keepAndShare")}
            </Button>
          }
          title={t("duplicates.keepAndShareTitle", { name: side.name })}
          description={t("duplicates.keepAndShareHint", { other: other.name, rep: other.repName })}
          confirmLabel={t("duplicates.keepAndShare")}
          successMessage={t("duplicates.keptSharedDone", { name: side.name, rep: other.repName })}
          onConfirm={() => ruleDuplicateAction(pair.id, "keptAndShared", side.id)}
          onDone={onDone}
        />
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** One figure, drawn the same on both sides of the pair. */
function Count({ value }: { value: number }) {
  return (
    <span dir="ltr" className="num font-medium">
      {value}
    </span>
  );
}
