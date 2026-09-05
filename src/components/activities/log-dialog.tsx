"use client";

import { Ellipsis, MapPin, MessageCircle, NotebookPen, Phone } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { editActivityAction, logActivityAction } from "@/actions/activities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
 * ONE dialog per screen, not one per row (DESIGN §5, D82). The day screen
 * offers Log on every card and a company's history offers Correct on every
 * entry; mounting a whole dialog behind each button put a hundred closed forms
 * on the rep's home page and a third of its weight in props that were the same
 * form a hundred times over. So the screen mounts a `LogDialogHost` once, and a
 * row renders a `LogButton` that only says WHICH company — the host holds what
 * every company on the screen can be logged against, and builds the one form
 * when a button is pressed. There is no trigger-owning variant on purpose: a
 * button outside a host throws, so the per-row shape cannot come back.
 *
 * Radix rejects an empty Select value, so "no project" / "no contact" carry a
 * sentinel that is turned back into null on the way to the action.
 */

export type LogContact = { id: string; name: string };
export type LogProject = { id: string; name: string };

/** What a company on the screen can be logged against, keyed by company id. */
export type LogTarget = {
  companyName?: string;
  contacts: readonly LogContact[];
  projects: readonly LogProject[];
};

/** An entry being corrected rather than written (D70). */
export type LogEdit = {
  id: string;
  text: string;
  channel: ActivityChannel;
  contactId: string | null;
  projectId: string | null;
};

type LogRequest = {
  companyId: string;
  /** Pre-picked when the button sits on a project's own screen. */
  projectId?: string | null;
  entry?: LogEdit;
};

/** A request with the target it was opened against, taken at the press. */
type LogOpen = LogRequest & { target: LogTarget };

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

const LogContext = createContext<((request: LogRequest) => void) | null>(null);

/**
 * Mounts the one log dialog for everything inside it. `targets` is the whole
 * screen's answer to "which contacts and projects can this be against",
 * serialised once — a server component passes it straight through.
 */
export function LogDialogHost({
  targets,
  children,
}: {
  targets: Readonly<Record<string, LogTarget>>;
  children: ReactNode;
}) {
  const [request, setRequest] = useState<LogOpen | null>(null);
  const [open, setOpen] = useState(false);
  // A new form for every press: the panel is keyed on this, so its state is
  // built from the request and never carried over from the last company.
  const [generation, setGeneration] = useState(0);

  const openFor = useCallback(
    (next: LogRequest) => {
      // The target is taken at the press and kept with the request, not read
      // off the prop on every render: a live update refreshes the screen under
      // an open form, and a company that slips off a capped band must not take
      // the half-typed entry with it.
      const target = targets[next.companyId];
      if (!target) throw new Error("LogButton for a company its LogDialogHost was not given");
      setRequest({ ...next, target });
      setGeneration((count) => count + 1);
      setOpen(true);
    },
    [targets],
  );

  // The panel stays mounted while it animates out, and is replaced — not
  // reset — by the next press.
  return (
    <LogContext.Provider value={openFor}>
      {children}
      {request ? (
        <LogPanel
          key={generation}
          open={open}
          onOpenChange={setOpen}
          request={request}
          target={request.target}
        />
      ) : null}
    </LogContext.Provider>
  );
}

/**
 * The button a row renders. It is an ordinary `Button` — variant, size, class
 * and aria-label pass straight through — that asks the host above it to open
 * the form for this company. `icon` draws the notebook here rather than taking
 * it as a child: an SVG passed in from a server component is serialised into
 * the page once per row, and a hundred rows carried a hundred copies of it.
 */
export function LogButton({
  companyId,
  projectId,
  entry,
  icon = false,
  onClick,
  children,
  ...button
}: Omit<ComponentProps<typeof Button>, "asChild"> & LogRequest & { icon?: boolean }) {
  const openFor = useContext(LogContext);
  if (!openFor) throw new Error("LogButton rendered outside a LogDialogHost");
  return (
    <Button
      type="button"
      {...button}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) openFor({ companyId, projectId, entry });
      }}
    >
      {icon ? <NotebookPen aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}

function LogPanel({
  open,
  onOpenChange,
  request,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: LogRequest;
  target: LogTarget;
}) {
  const { companyId, projectId, entry } = request;
  const { companyName, contacts, projects } = target;
  const editing = entry !== undefined;
  const t = useTranslations();
  const router = useRouter();
  const ids = useId();
  const [pending, startTransition] = useTransition();

  // A fresh entry every time it opens (the host remounts this per press), and
  // today is today in Riyadh — never the browser's day (src/lib/dates.ts).
  const [text, setText] = useState(entry?.text ?? "");
  const [channel, setChannel] = useState<ActivityChannel>(entry?.channel ?? "visit");
  const [happenedOn, setHappenedOn] = useState<string | null>(todayRiyadh());
  const [nextFollowUp, setNextFollowUp] = useState<string | null>(null);
  const [project, setProject] = useState<string>(entry?.projectId ?? projectId ?? NONE);
  const [contact, setContact] = useState<string>(entry?.contactId ?? NONE);
  const [textError, setTextError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Anything changed from how the form opened — a word, a chip, a date, a pick
  // — is work a tap beside the sheet must not throw away (D84).
  const today = todayRiyadh();
  const dirty =
    text.trim() !== (entry?.text ?? "").trim() ||
    channel !== (entry?.channel ?? "visit") ||
    happenedOn !== today ||
    nextFollowUp !== null ||
    project !== (entry?.projectId ?? projectId ?? NONE) ||
    contact !== (entry?.contactId ?? NONE);

  const textId = `${ids}-text`;
  const textErrorId = `${ids}-text-error`;
  const projectId_ = `${ids}-project`;
  const contactId = `${ids}-contact`;
  const channelLabelId = `${ids}-channel`;
  const happenedLabelId = `${ids}-happened`;
  const followUpLabelId = `${ids}-follow-up`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const written = text.trim();
    if (!written || !happenedOn) {
      setTextError(t("common.required"));
      // The message is announced; the cursor goes to the box it is about.
      textRef.current?.focus();
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

      if (entry) fields.set("activityId", entry.id);
      const result = entry
        ? await editActivityAction(null, fields)
        : await logActivityAction(null, fields);
      if (!result.ok) {
        setTextError(result.fieldErrors?.text ?? null);
        toast.error(result.error);
        return;
      }
      toast.success(t(entry ? "drawer.corrected" : "drawer.logged"));
      onOpenChange(false);
      // The drawer's activity list and the home follow-up strip are server
      // rendered; one refresh brings both up to date (SPEC §3: no refresh
      // buttons — the screen updates itself).
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A sentence typed in a lobby is not lost to a thumb landing beside the
          sheet: once something is written, a tap outside does nothing, and
          Cancel and Escape — deliberate — still close it (D84). */}
      <DialogContent
        className={cn(
          "max-h-[88svh] overflow-y-auto overscroll-contain sm:max-w-md",
          BOTTOM_SHEET_AT_375,
        )}
        onInteractOutside={(event) => {
          if (dirty) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(editing ? "drawer.correctTitle" : "drawer.logTitle")}</DialogTitle>
          <DialogDescription>
            {t(editing ? "drawer.correctSubtitle" : "drawer.logSubtitle")}
          </DialogDescription>
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
              ref={textRef}
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

          {/* Neither of these is offered when correcting (D70): the day is the
              entry's identity, and the follow-up is a figure the company row and
              two bands on the day screen read — moving it from here would leave
              two answers for one date. */}
          <div className={cn("grid gap-4 sm:grid-cols-2", editing && "hidden")}>
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
                <span className="ps-1 text-xs font-normal text-faint">{t("drawer.optional")}</span>
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
