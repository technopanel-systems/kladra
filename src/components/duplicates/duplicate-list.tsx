"use client";

import { useCallback, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ruleDuplicateAction } from "@/actions/duplicates";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { DayText } from "@/components/ui-ext/day-text";
import { StateBadge } from "@/components/ui-ext/state-badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { DuplicatePair, DuplicateSide } from "@/lib/duplicates";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

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
    <ul aria-label={t("duplicates.listLabel")} className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="card-face flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StateBadge tone={row.waited.late ? "bad" : "wait"}>
                {t("duplicates.sameNumber")}
              </StateBadge>
              {/* The evidence, and the reason this pair exists at all. A number
                  is always read left to right (rules/words.md). */}
              <span dir="ltr" className="num text-sm font-medium">
                {row.phone}
              </span>
            </span>
            <span
              className={cn("text-xs", row.waited.late ? TONE_TEXT.bad : "text-muted-foreground")}
            >
              {t("team.waitingDays", { count: row.waited.days })}
            </span>
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
      className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface-2 p-3"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">
          <bdi>{side.name}</bdi>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <bdi>{side.repName}</bdi>
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

      <dl className="flex flex-col gap-0.5 text-xs">
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

      {/* What would move if this record were not the one that continues.
          Figures in a row rather than a sentence: the manager is comparing the
          two sides, and a sentence per side has to be read twice to be compared
          once. The words are the app's existing names for the four things
          (D102) — a fifth name for a contact would be a fifth word for one
          thing.

          Two by two until the card is wide enough for four. A side is half a
          card from `sm` up, so four columns is under 75px each and «جهات
          الاتصال» — the app's own word, correct everywhere else — is cut in
          half. A figure whose caption is an ellipsis is not a figure. */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5 text-center lg:grid-cols-4">
        <Count value={side.has.contacts} label={t("common.contacts")} />
        <Count value={side.has.projects} label={t("common.projects")} />
        <Count value={side.has.quotations} label={t("common.quotations")} />
        <Count value={side.has.dispatches} label={t("common.dispatches")} />
      </div>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
        <ConfirmDialog
          trigger={
            <Button variant="brand" size="sm">
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
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** One figure and what it counts, drawn the same on both sides of the pair. */
function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span dir="ltr" className="num text-sm font-medium tabular-nums">
        {value}
      </span>
      {/* Wraps rather than truncates: the caption is what tells the manager
          what the figure counts, and a second line costs nothing here. */}
      <span className="text-[0.6875rem] leading-tight text-balance text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
