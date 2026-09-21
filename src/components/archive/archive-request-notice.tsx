"use client";

import { useLocale, useTranslations } from "next-intl";
import { approveArchiveAction, refuseArchiveAction } from "@/actions/archive-requests";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { DayText } from "@/components/ui-ext/day-text";
import { Prose } from "@/components/ui-ext/prose";
import { PromptDialog } from "@/components/ui-ext/prompt-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ArchiveRequestState } from "@/lib/archive-requests";

/**
 * Where a record's archiving stands, on the record itself (SPEC §3, P14 14.8).
 *
 * Three readers, one box. The rep who asked reads that it is with the manager
 * and nothing has happened yet — which is the whole reason it is here and not
 * only in his bell: a notice is read once and a record is read every day. The
 * manager reads the same sentence with two buttons under it. Everybody else on
 * the customer reads why somebody wants it gone, before they put more work into
 * it.
 *
 * A refusal stays on the record rather than vanishing when it is read: his
 * reason is what the next attempt has to answer, and a rep who has forgotten it
 * would otherwise ask again with the same sentence. It goes when the record is
 * asked for again, because the newest request is the one this shows.
 *
 * One component for all three kinds. The record it is about is named by the
 * request it was read with, so this knows nothing about companies, contacts or
 * projects — which is what keeps the founder's "one approval path" one path
 * rather than three that look alike.
 *
 * The two buttons are `ArchiveAnswerButtons` below, because the manager's own
 * band answers from the row as well (P14 14.8, M2): one pair of dialogs, one
 * pair of actions, one pair of sentences, wherever he presses them.
 */
export function ArchiveRequestNotice({
  request,
  canAnswer,
  name,
}: {
  request: ArchiveRequestState;
  /** Whether this reader answers requests (`answersArchiveRequests`). */
  canAnswer: boolean;
  /** The record's own name, for the two dialogs' titles. */
  name: string;
}) {
  const t = useTranslations();
  const locale = useLocale();

  if (request.status === "approved") return null;

  const refused = request.status === "refused";

  return (
    <div
      data-slot="archive-request"
      data-state={request.status}
      className="card-face flex flex-col gap-2 p-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">
          {refused ? t("drawer.archiveRefusedBy") : t("drawer.archiveRequestedBy")}
        </h3>
        <span className="text-xs text-faint">
          <bdi>{refused ? (request.decidedBy ?? "") : request.askedBy}</bdi>
        </span>
        {/* The day it happened, either way round: a rep coming back to a
            refusal wants to know whether it is this morning's or last month's,
            which is the same question the waiting one answers (P14 review). */}
        <span className="text-xs text-faint">
          <DayText day={refused ? request.decidedOn : request.askedOn} locale={locale} />
        </span>
      </div>

      {/* His reason where he has refused, the asker's where it is still waiting:
          in both states the words that matter are the newest ones.
          A block and not a line: it is a paragraph in its own box, under the
          word that says what it is, so it takes the direction of whoever typed
          it (rules/words.md). */}
      <Prose text={refused ? (request.refuseReason ?? "") : request.reason} className="text-sm" />

      {refused ? (
        <p className="text-xs text-muted-foreground">{t("drawer.archiveRefusedMeans")}</p>
      ) : canAnswer ? (
        <div className="flex flex-wrap gap-2">
          <ArchiveAnswerButtons requestId={request.id} name={name} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("drawer.archiveWaitingMeans")}</p>
      )}
    </div>
  );
}

/**
 * Yes and no, wherever he is standing (P14 14.8, M2).
 *
 * The notice above is one place he answers from and his own band on the team
 * screen is the other — the band row carries the name, the asker, the age and
 * the reason, which is the whole of "archive X because Y", so making him open
 * the record to press a button he could have pressed on the row was asking him
 * to travel for the answer he had already reached (S52: a reminder is cleared
 * by doing the work, where the work is).
 *
 * Two call sites, one pair of dialogs. A second copy on the band would be two
 * confirmations that disagree about how dangerous the same act is — the defect
 * `ConfirmDialog` itself was written to end — and two chances to forget that
 * refusing cannot happen without his words.
 *
 * Both dialogs name the record, because on the band the row is one of several
 * and the question has to say which one it is about.
 */
export function ArchiveAnswerButtons({
  requestId,
  name,
}: {
  /** The request, not the record: this is what is answered. */
  requestId: string;
  /** The record's own name, for the two dialogs' titles. */
  name: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <>
      <ConfirmDialog
        destructive
        trigger={
          <Button type="button" size="sm" variant="outline">
            {t("dispatches.approve")}
          </Button>
        }
        title={t("drawer.approveArchiveTitle", { name })}
        description={t("drawer.approveArchiveWarning")}
        confirmLabel={t("dispatches.approve")}
        successMessage={t("drawer.archived", { name })}
        onConfirm={() => approveArchiveAction(requestId)}
        onDone={() => router.refresh()}
      />
      <PromptDialog
        destructive
        multiline
        trigger={
          <Button type="button" size="sm" variant="ghost">
            {t("dispatches.refuse")}
          </Button>
        }
        title={t("drawer.refuseArchiveTitle", { name })}
        description={t("drawer.refuseArchiveHint")}
        label={t("drawer.refuseArchiveLabel")}
        placeholder={t("drawer.refuseArchivePlaceholder")}
        confirmLabel={t("dispatches.refuse")}
        successMessage={t("drawer.archiveRefused", { name })}
        onConfirm={(reason) => refuseArchiveAction(requestId, reason)}
        onDone={() => router.refresh()}
      />
    </>
  );
}
