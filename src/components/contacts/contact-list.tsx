"use client";

import { Archive, Pencil, Plus, Star } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setMainContactAction } from "@/actions/contacts";
import { ArchiveRequestNotice } from "@/components/archive/archive-request-notice";
import { useFailureToast } from "@/components/companies/failure-toast";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ArchiveContactDialog } from "@/components/contacts/archive-contact-dialog";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Avatar } from "@/components/ui-ext/avatar";
import { Empty } from "@/components/ui-ext/empty";
import { PhoneLinks } from "@/components/ui-ext/phone-links";
import { Prose } from "@/components/ui-ext/prose";
import { RowMenu } from "@/components/ui-ext/row-menu";
import { useOpener } from "@/components/ui-ext/use-opener";
import { useRowFlash } from "@/components/ui-ext/use-row-flash";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ArchiveRequestState } from "@/lib/archive-requests";
import type { E164 } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * The people at a company, on its drawer's Contacts tab (SPEC S11, P13-G6).
 *
 * Drawn by one client component from plain rows, with its dialogs mounted once
 * and told whose row asked (DESIGN §5: a list mounts one dialog and draws its
 * rows as data). It was a server loop that mounted an Edit and an Archive dialog
 * behind every card, with Make main, Edit and Archive as three buttons of one
 * weight on each — the destructive one beside the frequent one.
 *
 * Each card leads with the person's round avatar in the tint of his own id
 * (DESIGN §1b: a person is round, 24 in a row), then the name and the number,
 * which is what a rep came to the tab for: the number is the call. What he does
 * to a contact once in a while is in the card's menu — Edit, Make main — with
 * Archive last, behind its divider, in the tint. Only on a contact that is his
 * (D147): a colleague's card on a shared company offers nothing to press.
 *
 * After his own save the toast names the person and the card that changed takes
 * the arrived flash (DESIGN §8), so the star moving to a new card is seen moving.
 */

export type ContactRow = {
  id: string;
  name: string;
  /** Whose contact this is, in the reader's script (D68, D147). */
  repName: string;
  isMain: boolean;
  /** The reader added him, so the reader may change him (`assertContactMine`). */
  mine: boolean;
  /** As the rep typed it, for the edit form. Never displayed. */
  phone: string;
  phoneNormalized: E164;
  position: string | null;
  email: string | null;
  notes: string | null;
  /**
   * Where taking this person off the customer stands, or null while nobody has
   * ever asked (P14 14.8). A contact is archived down the same path a company
   * is, so the card carries the same notice the drawer above it does.
   */
  archiveRequest: ArchiveRequestState | null;
};

type Act = "edit" | "archive";

export function ContactList({
  companyId,
  companyName,
  country,
  rows,
  mayAdd,
  manyKeepers,
  answers,
}: {
  companyId: string;
  companyName: string;
  /** ISO code of the company's country, for reading a phone (D89). */
  country: string;
  rows: ContactRow[];
  /** Its rep, or anybody it is shared with (`mayKeepContacts`, D147). */
  mayAdd: boolean;
  /**
   * More than one person keeps people on this customer, so each card says
   * whose it is — the same buyer is legitimately two rows after a share or a
   * fold (D147, D158), and a caption that never varies is a word to read past.
   */
  manyKeepers: boolean;
  /**
   * Whether this reader ANSWERS requests to archive — the sales manager and the
   * admin (`answersArchiveRequests`, P14 14.8). The same boolean the drawer
   * above reads, handed down rather than asked again: it decides both what the
   * card's last menu item says and whether the notice on a card carries the two
   * buttons.
   */
  answers: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const guarded = useWireGuard();
  const failed = useFailureToast();
  const { flash, flashOf } = useRowFlash();
  const [, startTransition] = useTransition();

  // Whose card asked, kept while the dialog closes so its words do not blank
  // during the exit; and which dialog is open, if any.
  const [subject, setSubject] = useState<ContactRow | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const remember = useOpener(act !== null);
  const choose = (row: ContactRow, next: Act) => (opener: HTMLElement | null) => {
    remember(opener);
    setSubject(row);
    setAct(next);
  };
  const closeTo = (open: boolean) => {
    if (!open) setAct(null);
  };

  // Busy is not disabled (DESIGN §8): the card says it is saving, and a second
  // Make main while the first is out does nothing.
  const [making, setMaking] = useState<string | null>(null);
  const makingRef = useRef<string | null>(null);

  function makeMain(row: ContactRow) {
    if (makingRef.current) return;
    makingRef.current = row.id;
    setMaking(row.id);
    startTransition(async () => {
      const result = await guarded(setMainContactAction)(row.id);
      makingRef.current = null;
      setMaking(null);
      if (!result.ok) {
        failed(result, () => makeMain(row));
        return;
      }
      toast.success(t("drawer.mainSet", { name: row.name }));
      flash([row.id]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* In one position whatever the list below says: inside the empty branch
          it would be torn down by the very save that fills the list (D35). */}
      {mayAdd ? (
        <div className="flex">
          <AddContactDialog
            companyId={companyId}
            companyName={companyName}
            country={country}
            onAdded={(id) => flash([id])}
            trigger={
              <Button variant="outline">
                <Plus aria-hidden="true" />
                {t("drawer.addContact")}
              </Button>
            }
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Empty size="panel">{t("drawer.emptyContacts")}</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const marked = flashOf(row.id);
            // Nothing to press while an asking is with the sales manager (P14
            // 14.8): the action refuses a second one, and a control whose only
            // possible answer is a refusal is the dead control DESIGN §5 keeps
            // off the screen. What is left to do about it is in the notice
            // under his details, where the state is.
            const waiting = row.archiveRequest?.status === "waiting";
            return (
              <li
                key={row.id}
                data-contact={row.id}
                onAnimationEnd={marked.onAnimationEnd}
                className={cn("card-face flex items-start gap-3 p-3", marked.className)}
              >
                <Avatar id={row.id} name={row.name} size="sm" className="mt-px" />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">
                        <bdi>{row.name}</bdi>
                      </span>
                      {row.isMain ? (
                        <Badge variant="secondary" className="gap-1">
                          <Star aria-hidden="true" />
                          {t("drawer.mainContact")}
                        </Badge>
                      ) : null}
                      {making === row.id ? (
                        <span role="status" className="text-xs text-faint">
                          {t("common.saving")}
                        </span>
                      ) : null}
                    </div>
                    {row.mine ? (
                      <RowMenu
                        label={t("common.moreFor", { name: row.name })}
                        items={[
                          { label: t("common.edit"), icon: Pencil, onSelect: choose(row, "edit") },
                          ...(row.isMain
                            ? []
                            : [
                                {
                                  label: t("drawer.makeMain"),
                                  icon: Star,
                                  onSelect: () => makeMain(row),
                                },
                              ]),
                        ]}
                        end={
                          waiting
                            ? undefined
                            : {
                                // The same item and two acts: he archives,
                                // everybody else asks.
                                label: t(answers ? "drawer.archive" : "drawer.requestArchive"),
                                icon: Archive,
                                destructive: true,
                                onSelect: choose(row, "archive"),
                              }
                        }
                      />
                    ) : null}
                  </div>

                  {manyKeepers ? (
                    <span className="text-xs text-muted-foreground">
                      {t("drawer.contactKeptBy", { name: row.repName })}
                    </span>
                  ) : null}
                  {row.position ? (
                    <span className="text-xs text-muted-foreground">
                      <span className="sr-only">{t("common.position")}: </span>
                      <bdi>{row.position}</bdi>
                    </span>
                  ) : null}
                  {/* What was written about this person — which floor he sits
                      on, when he is reachable — read back on his own card
                      (D136). A line under the name, not a paragraph. */}
                  {row.notes ? (
                    <Prose
                      line
                      text={row.notes}
                      slot="contact-notes"
                      className="line-clamp-2 text-xs text-muted-foreground"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {/* A tap opens WhatsApp and the handset dials; the number
                        itself is the link text, so it is always readable
                        (SPEC §3, D98). */}
                    <PhoneLinks name={row.name} phone={row.phoneNormalized} />
                    {row.email ? (
                      <a
                        href={`mailto:${row.email}`}
                        dir="ltr"
                        className="min-w-0 truncate text-muted-foreground hover:underline"
                      >
                        {row.email}
                      </a>
                    ) : null}
                  </div>

                  {/* Whether this person is still on the customer, under the
                      details that say who he is (P14 14.8). Below them and not
                      above: the rep reads the name and the number first — that
                      is what he opened the tab for — and then reads that
                      somebody has asked for the card to go. The manager reads
                      the same sentence with Approve and Refuse under it. An
                      approved asking draws nothing: the person went with it,
                      and so did the card. */}
                  {row.archiveRequest ? (
                    // A hair of air under the number: the card's own rows sit a
                    // gap apart, and a bordered box wants more than a line does.
                    <div className="mt-1">
                      <ArchiveRequestNotice
                        request={row.archiveRequest}
                        canAnswer={answers}
                        name={row.name}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {subject ? (
        <>
          <EditContactDialog
            country={country}
            contact={{
              id: subject.id,
              name: subject.name,
              phone: subject.phone,
              position: subject.position,
              email: subject.email,
              notes: subject.notes,
            }}
            open={act === "edit"}
            onOpenChange={closeTo}
            onSaved={(id) => flash([id])}
          />
          {subject.archiveRequest?.status === "waiting" ? null : (
            <ArchiveContactDialog
              contactId={subject.id}
              contactName={subject.name}
              asks={!answers}
              open={act === "archive"}
              onOpenChange={closeTo}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
