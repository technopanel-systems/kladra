"use client";

import { Ellipsis, MapPin, MessageCircle, NotebookPen, Phone } from "lucide-react";
import { useId, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { logActivityAction } from "@/actions/activities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { useRouter } from "@/i18n/navigation";
import { todayRiyadh } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ActivityChannel } from "@/components/activities/activity-list";

/**
 * The log (SPEC S23): a rep standing in a lobby with a phone must finish this
 * in under a minute, or it gets filled in later from memory. So everything is
 * pre-filled — the company, today's date, "visit" — and only one field is
 * required: what happened, in the rep's own words.
 *
 * The company is shown and not editable: the dialog is always opened from
 * somewhere that already knows which company this is (SPEC §3).
 *
 * Radix rejects an empty Select value, so "no project" / "no contact" carry a
 * sentinel that is turned back into null on the way to the action.
 */

export type LogContact = { id: string; name: string };
export type LogProject = { id: string; name: string };

const NONE = "none";

const CHANNELS: readonly { value: ActivityChannel; Icon: typeof MapPin }[] = [
  { value: "visit", Icon: MapPin },
  { value: "call", Icon: Phone },
  { value: "whatsapp", Icon: MessageCircle },
  { value: "other", Icon: Ellipsis },
];

/**
 * At 375 a dialog is a bottom sheet — the thumb reaches the bottom (DESIGN §2).
 * These land on top of DialogContent's own centring, which is why they are
 * important: the base classes carry an attribute selector and would otherwise
 * win on specificity.
 */
const BOTTOM_SHEET_AT_375 =
  "max-sm:inset-x-0! max-sm:top-auto! max-sm:bottom-0! max-sm:translate-x-0! max-sm:translate-y-0! max-sm:max-w-none! max-sm:rounded-b-none!";

export function LogDialog({
  companyId,
  companyName,
  projectId,
  contacts,
  projects,
  trigger,
}: {
  companyId: string;
  /** Shown, never editable. Omitted only where the caller has no name to hand. */
  companyName?: string;
  /** Preselected when the dialog is opened from a project. */
  projectId?: string | null;
  contacts: readonly LogContact[];
  projects: readonly LogProject[];
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<ActivityChannel>("visit");
  const [happenedOn, setHappenedOn] = useState<string | null>(todayRiyadh());
  const [nextFollowUp, setNextFollowUp] = useState<string | null>(null);
  const [project, setProject] = useState<string>(projectId ?? NONE);
  const [contact, setContact] = useState<string>(NONE);
  const [textError, setTextError] = useState<string | null>(null);

  const textId = `${ids}-text`;
  const textErrorId = `${ids}-text-error`;
  const projectId_ = `${ids}-project`;
  const contactId = `${ids}-contact`;
  const channelLabelId = `${ids}-channel`;
  const happenedLabelId = `${ids}-happened`;
  const followUpLabelId = `${ids}-follow-up`;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    // A fresh entry every time it opens, and today is today in Riyadh — never
    // the browser's day (src/lib/dates.ts).
    setText("");
    setChannel("visit");
    setHappenedOn(todayRiyadh());
    setNextFollowUp(null);
    setProject(projectId ?? NONE);
    setContact(NONE);
    setTextError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const written = text.trim();
    if (!written || !happenedOn) {
      setTextError(t("common.required"));
      return;
    }
    setTextError(null);

    startTransition(async () => {
      // `(previous, FormData)` — the shape every write in src/actions takes.
      // The sentinels for "no project" and "no contact" become empty strings,
      // which the action reads as absent.
      const fields = new FormData();
      fields.set("companyId", companyId);
      fields.set("projectId", project === NONE ? "" : project);
      fields.set("contactId", contact === NONE ? "" : contact);
      fields.set("text", written);
      fields.set("channel", channel);
      fields.set("happenedOn", happenedOn);
      fields.set("nextFollowUp", nextFollowUp ?? "");

      const result = await logActivityAction(null, fields);
      if (!result.ok) {
        setTextError(result.fieldErrors?.text ?? null);
        toast.error(result.error);
        return;
      }
      toast.success(t("drawer.logged"));
      setOpen(false);
      // The drawer's activity list and the home follow-up strip are server
      // rendered; one refresh brings both up to date (SPEC §3: no refresh
      // buttons — the screen updates itself).
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <NotebookPen aria-hidden="true" />
            {t("common.log")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className={cn("max-h-[88svh] overflow-y-auto overscroll-contain sm:max-w-md", BOTTOM_SHEET_AT_375)}
      >
        <DialogHeader>
          <DialogTitle>{t("drawer.logTitle")}</DialogTitle>
          <DialogDescription>{t("drawer.logSubtitle")}</DialogDescription>
        </DialogHeader>

        {/* Validation is ours, so the message is translated and announced
            rather than shown in the browser's own bubble. */}
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("common.company")}</span>
            <p className="rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-sm">
              {companyName ?? "—"}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={textId}>
              {t("drawer.whatHappened")}
              <span aria-hidden="true" className="text-brand">
                *
              </span>
            </Label>
            <Textarea
              id={textId}
              rows={3}
              required
              aria-required="true"
              aria-invalid={textError ? true : undefined}
              aria-describedby={textError ? textErrorId : undefined}
              placeholder={t("drawer.whatHappenedPlaceholder")}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            {textError ? (
              <p id={textErrorId} role="alert" className="text-xs text-destructive">
                {textError}
              </p>
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend id={channelLabelId} className="mb-1.5 text-sm font-medium">
              {t("drawer.channel")}
            </legend>
            {/* Native radios: arrow keys, grouping and the announced state come
                free; the chip is the label around a visually hidden input. */}
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(({ value, Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    // Chosen is not a state: the five colours mean what
                    // happened to a record, and painting the selected chip red
                    // spends the loudest one on "you pressed this" (DESIGN §6).
                    // The quiet fill is what the filter chips use, for the same
                    // reason.
                    channel === value
                      ? "border-line-strong bg-secondary font-medium text-foreground"
                      : "border-line bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-channel`}
                    value={value}
                    checked={channel === value}
                    onChange={() => setChannel(value)}
                    className="sr-only"
                  />
                  <Icon aria-hidden="true" className="size-3.5" />
                  {t(`common.${value}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span id={happenedLabelId} className="text-sm font-medium">
                {t("drawer.happenedOn")}
              </span>
              <div role="group" aria-labelledby={happenedLabelId}>
                <DatePicker value={happenedOn} onChange={setHappenedOn} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span id={followUpLabelId} className="text-sm font-medium">
                {t("common.nextFollowUp")}
                <span className="ps-1 text-xs font-normal text-faint">
                  {t("drawer.optional")}
                </span>
              </span>
              <div role="group" aria-labelledby={followUpLabelId}>
                <DatePicker value={nextFollowUp} onChange={setNextFollowUp} />
              </div>
            </div>
          </div>

          {projects.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={projectId_}>
                {t("common.project")}
                <span className="text-xs font-normal text-faint">{t("drawer.optional")}</span>
              </Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger id={projectId_} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("drawer.noProject")}</SelectItem>
                  {projects.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {contacts.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={contactId}>
                {t("common.contact")}
                <span className="text-xs font-normal text-faint">{t("drawer.optional")}</span>
              </Label>
              <Select value={contact} onValueChange={setContact}>
                <SelectTrigger id={contactId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("drawer.noContact")}</SelectItem>
                  {contacts.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
