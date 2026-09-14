"use client";

import { Link2, NotebookPen } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  addReportAction,
  correctReportAction,
  reportFormAction,
  reportTargetsAction,
  type ReportForm,
  type ReportOption,
  type ReportTargets,
} from "@/actions/reports";
import { KIND_ICON, KINDS } from "@/components/activities/kinds";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { DayText } from "@/components/ui-ext/day-text";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { useBackGuard } from "@/components/ui-ext/use-back-guard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Channel } from "@/db/schema";
import { useRouter } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The report popup (SPEC §3 P13, 13.8): one thing that happened, in twenty
 * seconds on a phone.
 *
 * The fields are in the order a rep has the answers when a call ends: who it
 * was (the company, then the person — the main contact already chosen), what
 * it was about if it was about a paper, what kind of thing happened, what came
 * of it, and a line in his own words. The next follow-up and the day are last
 * because they are nearly always what they open on. A call to the main contact
 * that reached him, from the top bar, is: Add report · the company box · the
 * company · Call · Reached · the text box · Send — seven presses and the words.
 * From a customer's drawer or a call card the company is already there, and it
 * is five.
 *
 * ONE popup for the whole app (D82). It was one log dialog per screen, each
 * screen serialising what every row on it could be logged against; the popup is
 * reachable from everywhere now, so it reads what it needs when it opens, and
 * it is mounted once — in the top bar, which is on every signed-in screen — and
 * opened from anywhere by `useReport` or a `ReportButton`. The two talk through
 * a store rather than a React context because the top bar is not an ancestor of
 * the drawers that open it; the store refuses to open with no popup mounted, so
 * a button that nothing would answer fails loudly instead of doing nothing.
 */

/** A report being corrected rather than written (D70). */
export type ReportEdit = {
  id: string;
  companyId: string;
  companyName: string;
  text: string;
  kind: Channel;
  outcomeId: number;
  contactId: string | null;
  projectId: string | null;
  quotationId: string | null;
  dispatchId: string | null;
};

/** What the popup opens prefilled with — whatever the screen it is opened from knows. */
export type ReportRequest = {
  companyId?: string | null;
  /** Shown at once while the rest loads; the popup reads it again anyway. */
  companyName?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  quotationId?: string | null;
  dispatchId?: string | null;
  entry?: ReportEdit;
};

/* ---- the store ---------------------------------------------------------------- */

type Opened = { request: ReportRequest; generation: number; open: boolean };

let opened: Opened | null = null;
let hosts = 0;
/**
 * Whether the person signed in may write at all. False while an admin is viewing
 * as somebody (D42, D52): every write refuses a viewer, so no button offers one.
 * True until the host says otherwise, so an ordinary screen draws its buttons in
 * the first byte of HTML and only a viewer's disappear after hydration.
 */
let writable = true;
const listeners = new Set<() => void>();

function publish(next: Opened | null): void {
  opened = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a report can be written from this screen — the bottom bar asks (D42). */
export function useReportWritable(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => writable,
    () => true,
  );
}

function openReport(request: ReportRequest): void {
  if (hosts === 0) throw new Error("A report was opened with no ReportDialogHost mounted");
  // A new form for every press: the panel is keyed on the generation, so its
  // state is built from this request and never carried over from the last one.
  publish({ request, generation: (opened?.generation ?? 0) + 1, open: true });
}

function setOpen(open: boolean): void {
  // The panel stays mounted while it animates out, and is replaced — not reset
  // — by the next press.
  if (opened) publish({ ...opened, open });
}

/**
 * A function that opens the popup prefilled with `prefill`, and with anything
 * passed to it on top. Stable for the same prefill values.
 */
export function useReport(prefill: ReportRequest = {}): (override?: ReportRequest) => void {
  const { companyId, companyName, contactId, projectId, quotationId, dispatchId, entry } = prefill;
  return useCallback(
    (override: ReportRequest = {}) =>
      openReport({
        companyId,
        companyName,
        contactId,
        projectId,
        quotationId,
        dispatchId,
        entry,
        ...override,
      }),
    [companyId, companyName, contactId, projectId, quotationId, dispatchId, entry],
  );
}

/**
 * The button a screen renders. An ordinary `Button` — variant, size, class and
 * aria-label pass straight through — that opens the popup prefilled with what
 * the screen knows. `icon` draws the notebook here rather than taking it as a
 * child: an SVG handed in from a server component is serialised once per row.
 */
export function ReportButton({
  companyId,
  companyName,
  contactId,
  projectId,
  quotationId,
  dispatchId,
  entry,
  icon = false,
  onClick,
  children,
  ...button
}: Omit<ComponentProps<typeof Button>, "asChild"> & ReportRequest & { icon?: boolean }) {
  const open = useReport({ companyId, companyName, contactId, projectId, quotationId, dispatchId, entry });
  return (
    <Button
      type="button"
      {...button}
      aria-haspopup="dialog"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) open();
      }}
    >
      {icon ? <NotebookPen aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}

/** The one popup. Mounted once, in the top bar (D82). */
export function ReportDialogHost({ enabled }: { enabled: boolean }) {
  const state = useSyncExternalStore(
    subscribe,
    () => opened,
    () => null,
  );

  useEffect(() => {
    hosts += 1;
    writable = enabled;
    for (const listener of listeners) listener();
    return () => {
      hosts -= 1;
    };
  }, [enabled]);

  if (!state) return null;
  return (
    <ReportPanel
      key={state.generation}
      open={state.open}
      onOpenChange={setOpen}
      request={state.request}
    />
  );
}

/* ---- the form ----------------------------------------------------------------- */

const NONE = "none";

/** What the person has chosen, against the company it was chosen for. */
type Picks = {
  companyId: string;
  /** `undefined` is untouched: the contact opens on the main one. */
  contact?: string;
  project?: string;
  quotation?: string;
  dispatch?: string;
};

function initialPicks(request: ReportRequest): Picks {
  const entry = request.entry;
  if (entry) {
    return {
      companyId: entry.companyId,
      contact: entry.contactId ?? "",
      project: entry.projectId ?? "",
      quotation: entry.quotationId ?? "",
      dispatch: entry.dispatchId ?? "",
    };
  }
  return {
    companyId: request.companyId ?? "",
    contact: request.contactId ?? undefined,
    project: request.projectId ?? undefined,
    quotation: request.quotationId ?? undefined,
    dispatch: request.dispatchId ?? undefined,
  };
}

function ReportPanel({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ReportRequest;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const ids = useId();
  const guarded = useWireGuard();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const entry = request.entry;
  const editing = entry !== undefined;
  const locked = editing || Boolean(request.companyId);

  const [first] = useState(() => initialPicks(request));
  const [picks, setPicks] = useState<Picks>(first);
  const [kind, setKind] = useState<Channel | "">(entry?.kind ?? "");
  const [outcome, setOutcome] = useState<string>(entry ? String(entry.outcomeId) : "");
  const [text, setText] = useState(entry?.text ?? "");
  const [nextFollowUp, setNextFollowUp] = useState<Day | null>(null);
  const [day, setDay] = useState<"today" | "previous">("today");
  const [showLinks, setShowLinks] = useState(
    Boolean(first.project || first.quotation || first.dispatch),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // What the popup opens on — the customers he may write about, the outcomes,
  // and the two days — read when it opens (D82). A failure is said in the body
  // with the form kept, never an error page over what was typed.
  const [form, setForm] = useState<ReportForm | null>(null);
  const [formFailed, setFormFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    guarded(reportFormAction)().then((outcome) => {
      if (cancelled) return;
      if (outcome.ok && outcome.data) setForm(outcome.data);
      setFormFailed(!outcome.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [guarded]);

  // The people and papers at the chosen customer, kept against the customer
  // they were read for so a slow answer for the last one never fills this one.
  const companyId = picks.companyId;
  // The paper the popup opened on — from a drawer, or the entry being corrected —
  // asked for by id with the customer's lists, so it is a choice however old it
  // is: superseded, withdrawn, or past the newest thirty (P13 review). Only for
  // the customer it was opened on; choosing another customer lets go of it.
  const openedQuotation = companyId === first.companyId ? first.quotation || undefined : undefined;
  const openedDispatch = companyId === first.companyId ? first.dispatch || undefined : undefined;
  const [loaded, setLoaded] = useState<{ companyId: string; data: ReportTargets } | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    guarded(reportTargetsAction)({
      companyId,
      quotationId: openedQuotation,
      dispatchId: openedDispatch,
    }).then((outcome) => {
      if (!cancelled && outcome.ok && outcome.data) setLoaded({ companyId, data: outcome.data });
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, openedQuotation, openedDispatch, guarded]);
  const targets = loaded?.companyId === companyId ? loaded.data : null;

  const quotationOption = targets?.quotations.find((row) => row.value === picks.quotation);
  const dispatchOption = targets?.dispatches.find((row) => row.value === picks.dispatch);
  const contact = picks.contact ?? targets?.mainContact ?? "";
  // The job follows the paper when the paper names one and he has not chosen a
  // job himself: a report opened from Q-12 is about Q-12's job.
  const project =
    picks.project ?? quotationOption?.projectId ?? dispatchOption?.projectId ?? "";
  const quotation = picks.quotation ?? dispatchOption?.quotationId ?? "";
  const dispatch = picks.dispatch ?? "";

  const companyName =
    entry?.companyName ||
    request.companyName ||
    targets?.companyName ||
    form?.companies.find((row) => row.value === companyId)?.label ||
    "";

  // A follow-up is a date that belongs to somebody (D9, D147): the customer's
  // own when the customer is his, the job's when he works the job.
  const followUpOffered =
    !editing &&
    targets !== null &&
    (targets.companyFollowUp || (project !== "" && targets.workedProjects.includes(project)));

  const quotations = (targets?.quotations ?? []).filter(
    (row) => !project || !row.projectId || row.projectId === project,
  );
  const dispatches = (targets?.dispatches ?? []).filter(
    (row) =>
      (!project || !row.projectId || row.projectId === project) &&
      (!quotation || !row.quotationId || row.quotationId === quotation),
  );
  const hasLinks =
    targets !== null &&
    (targets.projects.length > 0 || targets.quotations.length > 0 || targets.dispatches.length > 0);

  // Anything changed from how the form opened — a word, a chip, a date, a pick
  // — is work a tap beside the sheet must not throw away (D84).
  const dirty =
    text.trim() !== (entry?.text ?? "").trim() ||
    kind !== (entry?.kind ?? "") ||
    outcome !== (entry ? String(entry.outcomeId) : "") ||
    nextFollowUp !== null ||
    day !== "today" ||
    picks !== first;
  // And the phone's back gesture, which is a route change and not a tap (D96).
  useBackGuard(open && dirty);

  function choose(patch: Omit<Partial<Picks>, "companyId">) {
    setPicks((current) => ({ ...current, ...patch }));
    // A box answered again is a box no longer refused.
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[`${key}Id`];
      return next;
    });
  }

  function chooseCompany(next: string) {
    // Everything under a customer goes with the customer: a contact or a job
    // left behind from the last choice would file this report somewhere nobody
    // picked.
    setPicks({ companyId: next });
    setErrors((current) => ({ ...current, companyId: "" }));
  }

  function chooseProject(next: string) {
    const value = next === NONE ? "" : next;
    const q = targets?.quotations.find((row) => row.value === quotation);
    const d = targets?.dispatches.find((row) => row.value === dispatch);
    choose({
      project: value,
      // A paper on another job stops being the one this report is about.
      quotation: value && q?.projectId && q.projectId !== value ? "" : quotation,
      dispatch: value && d?.projectId && d.projectId !== value ? "" : dispatch,
    });
  }

  function chooseQuotation(next: string) {
    const value = next === NONE ? "" : next;
    const q = targets?.quotations.find((row) => row.value === value);
    const d = targets?.dispatches.find((row) => row.value === dispatch);
    choose({
      quotation: value,
      project: q?.projectId ?? project,
      dispatch: value && d?.quotationId && d.quotationId !== value ? "" : dispatch,
    });
  }

  function chooseDispatch(next: string) {
    const value = next === NONE ? "" : next;
    const d = targets?.dispatches.find((row) => row.value === value);
    choose({
      dispatch: value,
      project: d?.projectId ?? project,
      quotation: d?.quotationId ?? quotation,
    });
  }

  function refuse(found: Record<string, string>) {
    setErrors(found);
    // The caret goes to the first box that was refused: a sheet can be taller
    // than a phone, and a message below the fold is a message nobody reads (D43).
    requestAnimationFrame(() => {
      const refused = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      // A row of chips is a radiogroup, and the group itself is only the thing
      // that carries the refusal — focusable by script, outlined by nothing. So
      // the caret goes to the chosen chip, or the first one: focus a keyboard can
      // see, and arrow keys that answer the question at once (P13 review).
      const radio =
        refused?.getAttribute("role") === "radiogroup"
          ? (refused.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
            refused.querySelector<HTMLInputElement>('input[type="radio"]'))
          : null;
      (radio ?? refused)?.focus({ focusVisible: true } as FocusOptions);
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React carries a submit through a portal to any form above it.
    event.stopPropagation();
    if (pending) return;

    const written = text.trim();
    const found: Record<string, string> = {};
    if (!companyId) found.companyId = t("common.required");
    if (!kind) found.kind = t("reports.dialog.kindRequired");
    if (!outcome) found.outcomeId = t("reports.dialog.outcomeRequired");
    if (!written) found.text = t("reports.dialog.textRequired");
    if (Object.keys(found).length > 0) {
      refuse(found);
      return;
    }
    setErrors({});

    startTransition(async () => {
      // `(previous, FormData)` — the shape every write in src/actions takes.
      const fields = new FormData();
      fields.set("kind", kind);
      fields.set("outcomeId", outcome);
      fields.set("text", written);
      fields.set("contactId", contact);
      fields.set("projectId", project);
      fields.set("quotationId", quotation);
      fields.set("dispatchId", dispatch);
      if (entry) {
        fields.set("activityId", entry.id);
      } else {
        fields.set("companyId", companyId);
        const previous = form?.lastWorkingDay;
        fields.set("happenedOn", day === "previous" && previous ? previous : (form?.today ?? ""));
        fields.set("nextFollowUp", followUpOffered ? (nextFollowUp ?? "") : "");
      }

      // Guarded: no signal in a lobby is a refusal too, with the words kept and
      // not the error card over them (D132).
      const result = entry
        ? await guarded(correctReportAction)(null, fields)
        : await guarded(addReportAction)(null, fields);
      if (!result.ok) {
        if (result.fieldErrors) refuse(result.fieldErrors);
        toast.error(result.error);
        return;
      }
      toast.success(t(entry ? "reports.dialog.corrected" : "reports.dialog.added"));
      onOpenChange(false);
      // Every list that shows reports is server rendered; one refresh brings
      // them all up to date (SPEC §3: no refresh buttons).
      router.refresh();
    });
  }

  // Enter sends, the way a message does; Shift+Enter is a new line. On a phone
  // the keyboard's own key says Send (`enterKeyHint`), which is the last press
  // of the twenty seconds.
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  const errorId = (name: string) => `${ids}-${name}-error`;
  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={errorId(name)} role="alert" className="text-xs text-destructive">
        {errors[name]}
      </p>
    ) : null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(editing ? "reports.dialog.correctTitle" : "common.addReport")}
      context={locked ? companyName || undefined : undefined}
      description={t(editing ? "reports.dialog.correctSubtitle" : "reports.dialog.subtitle")}
      // A sentence typed in a lobby is not lost to a thumb landing beside the
      // sheet, nor to one swiping it away or back from its edge, while Cancel
      // and Escape — deliberate — still close it (D84, D96).
      guardOutside={dirty}
    >
      {/* Validation is ours, so the message is translated and announced rather
          than shown in the browser's own bubble. */}
      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        data-slot="report-form"
        className="flex min-h-0 flex-1 flex-col"
      >
        {!form && !formFailed ? (
          <DialogFormSkeleton rows={5} />
        ) : (
          <FormBody>
            {formFailed ? (
              <p role="alert" className="text-sm text-destructive">
                {t("common.somethingWrong")}
              </p>
            ) : null}

            {/* The customer. Locked when the popup was opened from him, or when a
                report is being corrected — the wrong customer is unfiled, not
                moved (D70). */}
            <div className="flex flex-col gap-2">
              <Label id={`${ids}-company`}>{t("common.company")}</Label>
              {locked ? (
                <p className="flex min-h-9 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-1 text-sm">
                  {companyId ? (
                    <Avatar id={companyId} name={companyName || "?"} kind="company" size="sm" />
                  ) : null}
                  <Clip text={companyName} className="font-medium" />
                </p>
              ) : (
                <SearchableSelect
                  aria-labelledby={`${ids}-company`}
                  aria-describedby={errors.companyId ? errorId("companyId") : undefined}
                  invalid={errors.companyId ? true : undefined}
                  options={form?.companies ?? []}
                  value={companyId || null}
                  onChange={chooseCompany}
                  disabled={pending}
                  placeholder={t("common.pickCompany")}
                  searchPlaceholder={t("forms.searchList")}
                  emptyText={t("reports.dialog.noCompanies")}
                />
              )}
              {fieldError("companyId")}
            </div>

            {companyId && !targets ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : null}

            {targets && targets.contacts.length > 0 ? (
              <PickField
                id={`${ids}-contact`}
                label={t("common.contact")}
                optional={t("reports.dialog.optional")}
                value={contact}
                none={t("reports.dialog.noContact")}
                options={targets.contacts}
                onChange={(value) => choose({ contact: value === NONE ? "" : value })}
                disabled={pending}
                error={errors.contactId}
                errorId={errorId("contactId")}
              />
            ) : null}

            {/* The job or the paper it was about. Folded away until wanted, unless
                the popup was opened from one: most reports are about a customer,
                and three more boxes between a rep and the words is three more
                things to read on a phone. */}
            {targets && hasLinks ? (
              showLinks ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  {targets.projects.length > 0 ? (
                    <PickField
                      id={`${ids}-project`}
                      label={t("common.project")}
                      value={project}
                      none={t("reports.dialog.noProject")}
                      options={targets.projects}
                      onChange={chooseProject}
                      disabled={pending}
                      error={errors.projectId}
                      errorId={errorId("projectId")}
                    />
                  ) : null}
                  {targets.quotations.length > 0 ? (
                    <PickField
                      id={`${ids}-quotation`}
                      label={t("common.quotation")}
                      value={quotation}
                      none={t("reports.dialog.noQuotation")}
                      options={quotations}
                      code
                      onChange={chooseQuotation}
                      disabled={pending}
                      error={errors.quotationId}
                      errorId={errorId("quotationId")}
                    />
                  ) : null}
                  {targets.dispatches.length > 0 ? (
                    <PickField
                      id={`${ids}-dispatch`}
                      label={t("common.dispatch")}
                      value={dispatch}
                      none={t("reports.dialog.noDispatch")}
                      options={dispatches}
                      code
                      onChange={chooseDispatch}
                      disabled={pending}
                      error={errors.dispatchId}
                      errorId={errorId("dispatchId")}
                    />
                  ) : null}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit text-muted-foreground"
                  onClick={() => setShowLinks(true)}
                >
                  <Link2 aria-hidden="true" />
                  {t("reports.dialog.linkPaper")}
                </Button>
              )
            ) : null}

            <KindField
              legend={t("reports.dialog.kind")}
              name={`${ids}-kind`}
              value={kind}
              onChange={(next) => {
                setKind(next);
                setErrors((current) => ({ ...current, kind: "" }));
              }}
              disabled={pending}
              error={errors.kind}
              errorId={errorId("kind")}
            />

            <fieldset className="flex flex-col gap-2" disabled={pending}>
              <legend className="mb-2 text-sm font-medium">{t("reports.dialog.outcome")}</legend>
              <div
                role="radiogroup"
                aria-label={t("reports.dialog.outcome")}
                aria-invalid={errors.outcomeId ? true : undefined}
                aria-describedby={errors.outcomeId ? errorId("outcomeId") : undefined}
                tabIndex={-1}
                className="flex flex-wrap gap-2 outline-none"
              >
                {(form?.outcomes ?? []).map((row) => (
                  <label
                    key={row.id}
                    className={cn(
                      "touch inline-flex cursor-pointer items-center min-h-8 rounded-md border px-3 py-1 text-sm transition-colors",
                      "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                      // Refused, the caret is put on a chip by script, which a
                      // browser need not count as focus-visible: the ring then
                      // follows focus itself until the question is answered.
                      errors.outcomeId && "has-[:focus]:ring-3 has-[:focus]:ring-ring/50",
                      outcome === String(row.id)
                        ? "border-line-strong bg-secondary font-medium text-foreground"
                        : "border-line bg-surface-2 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${ids}-outcome`}
                      value={row.id}
                      checked={outcome === String(row.id)}
                      onChange={() => {
                        setOutcome(String(row.id));
                        setErrors((current) => ({ ...current, outcomeId: "" }));
                      }}
                      className="sr-only"
                    />
                    <bdi>{row.name}</bdi>
                  </label>
                ))}
              </div>
              {fieldError("outcomeId")}
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${ids}-text`}>{t("reports.dialog.text")}</Label>
              <Textarea
                id={`${ids}-text`}
                rows={3}
                dir="auto"
                enterKeyHint="send"
                aria-required="true"
                aria-invalid={errors.text ? true : undefined}
                aria-describedby={errors.text ? errorId("text") : undefined}
                placeholder={t("reports.dialog.textPlaceholder")}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={sendOnEnter}
                disabled={pending}
                className="break-words"
              />
              {fieldError("text")}
            </div>

            {/* Neither of these is offered when correcting (D70): the day is the
                entry's identity, and the follow-up is a figure the company row
                and two bands on the day screen read. */}
            {!editing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {followUpOffered ? (
                  <div className="flex flex-col gap-2">
                    <span id={`${ids}-follow-up`} className="text-sm font-medium">
                      {t("common.nextFollowUp")}
                      <span className="ps-1 text-xs font-normal text-faint">
                        {t("reports.dialog.optional")}
                      </span>
                    </span>
                    <div role="group" aria-labelledby={`${ids}-follow-up`}>
                      <DatePicker
                        value={nextFollowUp}
                        onChange={setNextFollowUp}
                        min={form?.today}
                        disabled={pending}
                        invalid={errors.nextFollowUp ? true : undefined}
                        aria-describedby={errors.nextFollowUp ? errorId("nextFollowUp") : undefined}
                      />
                    </div>
                    {fieldError("nextFollowUp")}
                  </div>
                ) : null}

                {form ? (
                  <fieldset className="flex flex-col gap-2" disabled={pending}>
                    <legend className="mb-2 text-sm font-medium">
                      {t("reports.dialog.happenedOn")}
                    </legend>
                    <div
                      role="radiogroup"
                      aria-label={t("reports.dialog.happenedOn")}
                      aria-invalid={errors.happenedOn ? true : undefined}
                      tabIndex={-1}
                      className="flex flex-wrap gap-2 outline-none"
                    >
                      {(["today", "previous"] as const).map((which) => (
                        <label
                          key={which}
                          className={cn(
                            "touch inline-flex cursor-pointer items-center min-h-8 rounded-md border px-3 py-1 text-sm transition-colors",
                            "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                            errors.happenedOn && "has-[:focus]:ring-3 has-[:focus]:ring-ring/50",
                            day === which
                              ? "border-line-strong bg-secondary font-medium text-foreground"
                              : "border-line bg-surface-2 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <input
                            type="radio"
                            name={`${ids}-day`}
                            value={which}
                            checked={day === which}
                            onChange={() => setDay(which)}
                            className="sr-only"
                          />
                          {which === "today" ? (
                            t("common.today")
                          ) : (
                            <DayText day={form.lastWorkingDay} locale={locale} />
                          )}
                        </label>
                      ))}
                    </div>
                    {fieldError("happenedOn")}
                  </fieldset>
                ) : null}
              </div>
            ) : null}
          </FormBody>
        )}
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </ResponsiveDialog>
  );
}

/**
 * What kind of thing happened, as a row of buttons with a picture on each
 * (SPEC §3 P13). Native radios drawn as buttons, so arrow keys, grouping and the
 * announced state come free, and each button is the label around a visually
 * hidden input and a 44px target a thumb presses (D130).
 */
function KindField({
  legend,
  name,
  value,
  onChange,
  disabled,
  error,
  errorId,
}: {
  legend: string;
  name: string;
  value: Channel | "";
  onChange: (next: Channel) => void;
  disabled?: boolean;
  error?: string;
  errorId: string;
}) {
  const t = useTranslations("common");
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div
        role="radiogroup"
        aria-label={legend}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        tabIndex={-1}
        className="grid grid-cols-3 gap-2 outline-none"
      >
        {KINDS.map((option) => {
          const Icon = KIND_ICON[option];
          const chosen = value === option;
          return (
            <label
              key={option}
              className={cn(
                "touch flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                // As on the outcome's chips: refused, the ring follows focus.
                error && "has-[:focus]:ring-3 has-[:focus]:ring-ring/50",
                chosen
                  ? "border-line-strong bg-secondary font-medium text-foreground"
                  : "border-line bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={chosen}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              <Icon aria-hidden="true" className="size-5" />
              <span>{t(option)}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** A short list with "nobody / none" as a real answer that can be given twice. */
function PickField({
  id,
  label,
  optional,
  value,
  none,
  options,
  onChange,
  disabled,
  code = false,
  error,
  errorId,
}: {
  id: string;
  label: string;
  optional?: string;
  value: string;
  none: string;
  options: ReportOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The label is a paper's number, a run with no letters in it (DESIGN §5). */
  code?: boolean;
  error?: string;
  errorId: string;
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-xs font-normal text-faint">{optional}</span> : null}
      </Label>
      <Select value={value || NONE} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{none}</SelectItem>
          {options.map((row) => (
            <SelectItem key={row.value} value={row.value}>
              {code ? (
                <span dir="ltr" className="num">
                  {row.label}
                </span>
              ) : (
                <bdi>{row.label}</bdi>
              )}
              {row.hint ? (
                <span className="text-xs text-muted-foreground">
                  {" · "}
                  <bdi>{row.hint}</bdi>
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
