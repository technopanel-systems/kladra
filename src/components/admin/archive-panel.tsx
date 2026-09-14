"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { restoreAction } from "@/actions/admin";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { Empty } from "@/components/ui-ext/empty";
import { Sqm } from "@/components/ui-ext/figures";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { PhoneLinks } from "@/components/ui-ext/phone-links";
import { Prose } from "@/components/ui-ext/prose";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { ArchiveKind, ArchivedRow } from "@/lib/admin";
import { formatDay } from "@/lib/dates";
import { storedE164 } from "@/lib/phone";

/**
 * Everything taken off the floor, and the way back (SPEC S16, D24, P13-S7).
 *
 * This screen is what makes "archive, never delete" true. Without it archiving
 * IS deleting with extra steps, which is the promise D24 makes to a rep who
 * presses Archive on the wrong row — and that rep's mistake is what the admin
 * opens it for. So each row answers what he checks before putting a thing back:
 * what it was and on which company (the company's avatar leads every row, a
 * contact's and a project's included), who took it off the floor and when, and
 * the reason where one was given. Then one press.
 *
 * One press and not a confirmation, because restoring takes nothing away: the
 * thing goes back where it was with its history, and a restore nobody wanted is
 * archived again. The confirmation was a second question about the one act on
 * this screen that cannot hurt anybody.
 *
 * A contact or a project comes back onto its company, and only if the company
 * is on the floor: restored under an archived company it would sit on a row
 * that appears on no list, which is the same disappearance by another route
 * (D92). Such a row, and a record folded into another (P12-8), shows the
 * sentence and no button: no work a screen offers that the action would refuse
 * (DESIGN §5).
 */

/** The group headings, in the reader's plural — literal, so both locales are held to each. */
const GROUP_KEYS: Record<ArchiveKind, string> = {
  company: "common.companies",
  contact: "common.contacts",
  project: "common.projects",
};

/**
 * The groups in `ARCHIVE_KINDS` order, read off the map above: that list lives
 * beside the database in `@/lib/admin`, and a value from there would carry the
 * database into the browser (rules/data.md). The Record keeps this exhaustive.
 */
const KINDS = Object.keys(GROUP_KEYS) as ArchiveKind[];

/** Where the thing it was can be read: a company's drawer, or the project's own. */
function recordHref(row: ArchivedRow): string {
  return row.kind === "project" ? `/projects?open=${row.id}` : `/companies?open=${row.companyId}`;
}

export function ArchivePanel({
  rows,
  q,
  survivors,
}: {
  rows: ArchivedRow[];
  q: string;
  /**
   * For a folded company the reader may open, the id of the company it became
   * (D121): its "Folded into …" is then a door. Absent, it stays a sentence.
   */
  survivors: Record<string, string>;
}) {
  const t = useTranslations();

  if (rows.length === 0) {
    return q ? (
      <Empty
        action={
          <Button asChild variant="outline">
            <Link href="/admin/archive">{t("common.clear")}</Link>
          </Button>
        }
      >
        {t("admin.archiveEmptySearch", { q })}
      </Empty>
    ) : (
      <Empty>{t("admin.emptyArchive")}</Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {KINDS.map((kind) => {
        const group = rows.filter((row) => row.kind === kind);
        if (group.length === 0) return null;
        const headingId = `archive-${kind}`;
        return (
          <section key={kind} aria-labelledby={headingId} data-kind={kind} className="flex flex-col gap-2">
            <h2 id={headingId} className="flex items-center gap-2 text-sm font-medium">
              {t(GROUP_KEYS[kind])}
              <span dir="ltr" className="num rounded-full bg-surface-2 px-2 text-xs text-muted-foreground">
                {group[0].inKind}
              </span>
            </h2>
            <ul className="card-face flex flex-col">
              {group.map((row) => (
                <ArchivedItem
                  key={`${row.kind}-${row.id}`}
                  row={row}
                  survivorId={row.kind === "company" ? survivors[row.id] : undefined}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ArchivedItem({ row, survivorId }: { row: ArchivedRow; survivorId?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const day = formatDay(row.archivedOn, locale);
  const kindWord = t(`admin.kind.${row.kind}`);

  return (
    <li className="hover-tint flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 last:border-0">
      <Avatar id={row.companyId} name={row.companyName} kind="company" />

      {/* Wide enough to read a name and its reason on a phone: below twelve
          rems the Restore button wraps under it rather than squeezing it. */}
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Link href={recordHref(row)} className="flex items-center gap-2 font-medium hover:underline">
          <Clip text={row.name} />
          <LinkPending />
        </Link>

        {/* What it was, and where: a company is on somebody's floor, a contact
            or a project is at a company. */}
        <span className="text-xs text-muted-foreground">
          {row.kind === "company"
            ? t("admin.archivedFloor", { kind: kindWord, name: row.repName })
            : t("admin.archivedAt", { kind: kindWord, company: row.companyName })}
        </span>

        {row.kind === "contact" && (row.position || row.phone) ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {row.position ? (
              <span>
                <bdi>{row.position}</bdi>
              </span>
            ) : null}
            {row.phone ? <PhoneLinks name={row.name} phone={storedE164(row.phone)} /> : null}
          </span>
        ) : null}

        {row.kind === "project" && row.expectedSqm ? (
          <Sqm value={row.expectedSqm} className="text-xs text-muted-foreground" />
        ) : null}

        {/* Why, in the words of whoever did it (S16, D87) — typed text, so it
            takes its own direction; under the name, where it is read. */}
        {row.reason ? (
          <Prose line text={row.reason} className="text-xs text-foreground" />
        ) : null}

        {/* A tombstone says what it became instead of why it left (P12-8, D13),
            and the company it became is one press away (D121, P13-G6): the
            admin checking a fold opens the record that continues, not the
            tombstone, which is empty by design. Underlined, because it is a door
            in a column of plain lines. */}
        {row.mergedIntoName && survivorId ? (
          <Link
            href={`/companies?open=${survivorId}`}
            data-slot="open-survivor"
            className="flex w-fit items-center gap-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            <span>{t("duplicates.foldedIntoShort", { name: row.mergedIntoName })}</span>
            <LinkPending />
          </Link>
        ) : row.mergedIntoName ? (
          <span className="text-xs text-muted-foreground">
            {t("duplicates.foldedIntoShort", { name: row.mergedIntoName })}
          </span>
        ) : null}

        <span data-slot="archived-by" className="flex items-center gap-2 text-xs text-muted-foreground">
          {row.archivedById && row.archivedByName ? (
            <>
              <Avatar id={row.archivedById} name={row.archivedByName} size="sm" />
              {t("admin.archivedBy", { name: row.archivedByName, date: day })}
            </>
          ) : (
            t("admin.archivedOnDay", { date: day })
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center">
        {row.mergedIntoName ? (
          <span className="max-w-64 text-xs text-muted-foreground">{t("admin.restoreMerged")}</span>
        ) : row.companyArchived ? (
          <span className="max-w-64 text-xs text-muted-foreground">
            {row.kind === "contact"
              ? t("admin.restoreCompanyFirstContact")
              : t("admin.restoreCompanyFirstProject")}
          </span>
        ) : (
          <RestoreButton row={row} />
        )}
      </div>
    </li>
  );
}

function RestoreButton({ row }: { row: ArchivedRow }) {
  const t = useTranslations();
  const router = useRouter();
  const guarded = useWireGuard();
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const form = new FormData();
      form.set("kind", row.kind);
      form.set("id", row.id);
      const outcome = await guarded(restoreAction)(null, form);
      if (!outcome.ok) {
        // A failure the admin has to act on stays until it is closed (DESIGN
        // §8); the sentence is the action's own, with its next step in it.
        toast.error(outcome.error, {
          duration: Infinity,
          cancel: { label: t("common.close"), onClick: () => {} },
        });
        return;
      }
      toast.success(t("admin.restored", { name: row.name }));
      router.refresh();
    });
  }

  // While it is on its way the button says so and sends no second press: a
  // second one would only be refused as "not there any more", and a press that
  // does nothing visible reads as a press that did not land. Busy, not disabled
  // (DESIGN §8): it keeps its place and its focus while it works.
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-busy={pending || undefined}
      onClick={() => {
        if (!pending) restore();
      }}
    >
      {pending ? t("common.saving") : t("admin.restore")}
    </Button>
  );
}
