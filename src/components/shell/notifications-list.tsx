"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { markReadAction } from "@/actions/notifications";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { Prose } from "@/components/ui-ext/prose";
import type { NotificationRow } from "@/lib/notifications";
import { cn } from "@/lib/utils";

/**
 * What Kladra told this person, newest first.
 *
 * Each row is the sentence and the thing it is about, and pressing it goes
 * there and marks it read in one move — because the point of a notice is the
 * work at the other end of it, and a rep who has to press "read" as well learns
 * to press nothing (S52, S53).
 *
 * The sentence is built here from the kind and its params, in the reader's
 * language: `notifications.<kind>` (D13). The stored row holds no English.
 */
export function NotificationsList({
  rows,
  canWrite = true,
}: {
  rows: NotificationRow[];
  /**
   * False while somebody is viewing as this person (D42): the door refuses
   * the write anyway, but a control that cannot be used is not offered
   * (DESIGN §5) — and the honest view-as test found this one was (D103).
   */
  canWrite?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();

  const unread = rows.filter((row) => !row.read).length;

  function markAll() {
    // Busy, not disabled (states-feedback): the button keeps its place and the
    // focus while the write is out, says what it is doing, and a second press
    // is simply not a second write.
    if (pending) return;
    startTransition(async () => {
      const outcome = await guarded(markReadAction)();
      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }
      toast.success(t("notifications.allMarkedRead"));
      router.refresh();
    });
  }

  function open(row: NotificationRow) {
    if (row.read || !canWrite) return;
    // Fire and forget: the navigation is the point, and a notice that stayed
    // bold because a write was slow is not worth holding the rep up for.
    startTransition(async () => {
      await guarded(markReadAction)(row.id);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {unread > 0 && canWrite ? (
        <div className="flex">
          <Button type="button" variant="outline" onClick={markAll} aria-busy={pending || undefined}>
            {pending ? t("notifications.markingRead") : t("common.markAllRead")}
          </Button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            {/* Unread and read are told apart three ways, so the difference
                survives with the colour switched off (DESIGN §5: colour is
                never the only carrier). An unread notice is a card at rest —
                the surface and its shadow — with its sentence at the heavier
                weight in the full text colour; one already read steps back to
                a hairline on the canvas and a muted sentence. The dot stays as
                the quick glance, and the word is in the label for a reader. */}
            <Link
              href={row.link}
              onClick={() => open(row)}
              data-state={row.read ? "read" : "unread"}
              className={cn(
                "hover-tint flex items-start gap-3 p-3",
                row.read ? "rounded-xl border border-line" : "card-face",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("mt-2 size-2 shrink-0 rounded-full", row.read ? null : "bg-brand")}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  data-slot="notice-sentence"
                  className={cn(
                    "text-sm",
                    row.read ? "text-muted-foreground" : "font-medium text-foreground",
                  )}
                >
                  {/* Raised for him by somebody else (SPEC §3 P13): the same
                      kind, and the sentence that says who raised it. */}
                  {row.raisedFor
                    ? t(`notifications.raisedFor.${row.raisedFor}`, row.params)
                    : t(`notifications.${row.kind}`, row.params)}
                  {row.read ? null : (
                    <span className="sr-only"> · {t("notifications.unreadMark")}</span>
                  )}
                </span>
                {/* Her words, in her direction. The reason used to be dropped
                    into the sentence itself — "Q-2 came back for edits: …" —
                    which put a paragraph somebody TYPED inside a line built
                    from the message file, running the way the page runs. A
                    block a person wrote takes its direction from the text
                    (words.md, DESIGN §5), so it is a block, under the sentence
                    that says what happened — a line of it, starting where the
                    sentence starts, not a paragraph aligned its own way. */}
                <Prose
                  line
                  text={reasonOf(row)}
                  slot="notice-reason"
                  className="text-sm text-muted-foreground"
                />
                {/* Three things on the row and three weights, now that her
                    words are one of them: what happened, then what she wrote
                    about it, then when. The day was muted like the reason above
                    it and told apart only by being two pixels smaller, which is
                    not a difference anybody reads (DESIGN §1's three steps). */}
                <DayText day={row.day} locale={locale} className="text-xs text-faint" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What somebody wrote about it, if anybody wrote anything. */
function reasonOf(row: NotificationRow): string {
  const reason = row.params.reason;
  return typeof reason === "string" ? reason : "";
}
