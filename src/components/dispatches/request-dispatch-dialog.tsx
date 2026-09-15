"use client";

import { Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  creditChoicesAction,
  type CreditChoices,
  type DispatchLookups,
  type QuotationLookups,
} from "@/actions/forms";
import {
  directCompaniesAction,
  dispatchOnBehalfAction,
  dispatchPrefillAction,
  requestDispatchAction,
  updateDispatchAction,
  type DispatchPrefill,
} from "@/actions/dispatches";
import { quotationServiceChoicesAction } from "@/actions/quotations";
import {
  DispatchLines,
  lineNumbers,
  type CarriedFacts,
  type LoadDraft,
} from "@/components/dispatches/dispatch-lines";
import { blankLine } from "@/components/quotations/quotation-lines";
import { QuotationServices, type ServiceDraft } from "@/components/quotations/quotation-services";
import { QuotationTotals } from "@/components/quotations/quotation-totals";
import { ChoiceChips } from "@/components/ui-ext/choice-chips";
import { CreditField } from "@/components/ui-ext/credit-field";
import { useSubmitAction, useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useDispatchLookups, useQuotationLookups } from "@/components/ui-ext/form-lookups";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { RaisedForField, useOnBehalf } from "@/components/ui-ext/raised-for-field";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect, type SelectOption } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { differenceFrom, type SheetValues } from "@/lib/dispatch-difference";
import { lineRefusal } from "@/lib/line-refusal";
import { quotationTotals } from "@/lib/money";
import { dispatchEligible, openingFor, type DispatchOnBehalf } from "@/lib/on-behalf-option";
import { splitOption, type DispatchTargets } from "@/lib/picker-option";
import type { DraftLine, DraftService } from "@/lib/quotation-draft";
import {
  detailLegendKey,
  detailsFor,
  needsNote,
  paymentDetailLabel,
  paymentTermsLabel,
  PAYMENT_TERMS,
  type PaymentDetail,
  type PaymentTerms,
} from "@/lib/payment";
import { ToneNote } from "@/components/dispatches/tone-note";

/**
 * Raise a dispatch, or correct one the desk has not approved (SPEC §3, S37–S40,
 * P13).
 *
 * The chain in the order a rep has the answers: the customer, then **where the
 * load comes from** — that customer's latest issued quotation already chosen,
 * any other of his papers to choose instead, or **Direct**, for a load with no
 * quotation and no job behind it. Choosing a paper opens the load on the whole of
 * it: every line with its sheet, its price and the quantity still left to send,
 * and every service with its m² and price. All of it is editable — a line or a
 * service can go, another can be added — and the moment the load stops being
 * what the paper says, the form says so; the action works out exactly what
 * differs, from the rows, and records it for the desk. A direct load opens on one
 * empty line with a price to type (D169) and no services.
 *
 * Opening on the paper is a child reading its own parent (D159), which is not the
 * carrying forward §3 forbids: nothing here comes from the dispatch before this
 * one — not the site, not how it was paid for — and those are typed for this
 * load (D163).
 *
 * The same dialog corrects a request still waiting or one the desk refused, on
 * what it already says, because retyping a load to change one quantity is how a
 * form ends up on WhatsApp instead (S54). What is left is read fresh every time,
 * never cached — another dispatch raised a minute ago has spent some of it (D12).
 */

/** A service on the form, with the quotation service it was carried from in its key. */
const CARRIED = "from-";

/** The quotation service a service row was carried from, or null for one the rep added. */
function carriedFrom(key: string): string | null {
  return key.startsWith(CARRIED) ? key.slice(CARRIED.length) : null;
}

/** The "no paper" answer to Where it comes from, as a value rather than as emptiness. */
const DIRECT = "direct";

export type DispatchDraft = {
  dispatchId: string;
  companyId: string;
  companyName: string;
  /** The paper it was prefilled from, or null for a direct load. */
  quotationId: string | null;
  quotationLabel: string | null;
  shipmentMethodId: string;
  /** Which store it leaves from (SPEC §3, P12-9). */
  warehouseId: string;
  destination: string;
  paymentTerms: PaymentTerms;
  paymentDetail: PaymentDetail | null;
  paymentNote: string | null;
  /** The load as it stands, each line and service with the quotation row it came from. */
  lines: (DraftLine & { quotationItemId: string | null })[];
  /** Each with its name, which the form needs where the admin no longer offers it. */
  services: (DraftService & { quotationServiceId: string | null; name: string })[];
  /**
   * What it says it counts for: one person's id, or `split` (D148). A dispatch
   * still waiting has earned nobody anything yet, so the answer is editable for
   * exactly as long as the quantities beside it are.
   */
  creditTo?: string;
};

export type DispatchMode = "request" | "edit";

const ACTIONS = {
  request: requestDispatchAction,
  edit: updateDispatchAction,
} as const;

export function RequestDispatchDialog({
  quotationId,
  quotationLabel,
  companyId,
  companyName,
  targets,
  mode = "request",
  existing,
  raisesForOthers = false,
  trigger,
}: {
  /** Known when the dialog is opened from a quotation's drawer: customer and paper are fixed. */
  quotationId?: string;
  /** Q-12 — named in the title, because the load is against it. */
  quotationLabel?: string;
  /** Known when it is opened from a customer (or a job): the customer is fixed. */
  companyId?: string;
  companyName?: string;
  /**
   * The customers and the papers each may send against (P12-10). The customers a
   * rep may load a truck for with nothing behind it are asked for when the
   * dialog opens (`directCompaniesAction`) and added to them.
   */
  targets?: DispatchTargets;
  mode?: DispatchMode;
  existing?: DispatchDraft;
  /**
   * The coordinator, who may raise this load for a rep (SPEC §3 P13): the form
   * then asks "For" first. Passed down from the server the way the quotation
   * dialog's `issuesDirectly` is, so a rep's dialog makes no extra round trip;
   * `requestDispatchAction` asks the role again, and it is the one that decides.
   */
  raisesForOthers?: boolean;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { lookups: dispatchLists, failed: dispatchFailed } = useDispatchLookups(open);
  const { lookups: lineLists, failed: linesFailed } = useQuotationLookups(open);
  const serviceChoices = useServiceChoices(open);
  // Whom it is for, on a first ask only: a load being corrected is already his.
  const onBehalf = useOnBehalf(
    open && raisesForOthers && mode === "request",
    quotationId ?? "",
    () => dispatchOnBehalfAction({ quotationId }),
  );
  // Only where the customer is a choice or Direct might be: never on a load
  // already against a paper, never on an edit, which cannot change either.
  const own = useDirectCompanies(open && !quotationId && !existing);

  const onSaved = useCallback(
    (dispatchId: string | undefined) => {
      toast.success(t(mode === "edit" ? "dispatches.updated" : "dispatches.requested"));
      setOpen(false);
      if (dispatchId) router.push(`/dispatches?open=${dispatchId}`);
      else router.refresh();
    },
    [mode, router, t],
  );

  const ready =
    dispatchLists &&
    lineLists &&
    Array.isArray(serviceChoices) &&
    (quotationId || existing || own) &&
    onBehalf !== undefined;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={
        mode === "edit"
          ? t("dispatches.editRequest")
          : quotationLabel
            ? t("dispatches.requestFor", { label: quotationLabel })
            : t("dispatches.request")
      }
      description={t("dispatches.requestHint")}
      // Lines are a table and services a second one under them, as on the
      // quotation this load comes from (SPEC §3, P13).
      size="wide"
      trigger={
        trigger ?? (
          <Button variant="outline">
            <Truck aria-hidden="true" />
            {t("dispatches.request")}
          </Button>
        )
      }
    >
      {dispatchFailed || linesFailed || serviceChoices === "failed" || onBehalf === "failed" ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : ready ? (
        <LoadForm
          mode={mode}
          existing={existing}
          fixedQuotation={quotationId ? { id: quotationId, label: quotationLabel ?? "" } : null}
          fixedCompany={companyId ? { id: companyId, name: companyName ?? "" } : null}
          targets={targets}
          own={own ?? []}
          onBehalf={onBehalf ?? null}
          dispatchLists={dispatchLists}
          lineLists={lineLists}
          serviceChoices={serviceChoices}
          onSaved={onSaved}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <DialogFormSkeleton rows={6} />
      )}
    </ResponsiveDialog>
  );
}

/**
 * The services the admin offers, asked each time the dialog opens: a service
 * turned off an hour ago should stop being offered. Not a courtesy read — the
 * services section is part of the load — so a list that could not be fetched is
 * "the lists did not load" like the others (rules/data.md).
 */
function useServiceChoices(open: boolean): SelectOption[] | "failed" | null {
  const guarded = useWireGuard();
  const [choices, setChoices] = useState<SelectOption[] | "failed" | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    guarded(quotationServiceChoicesAction)().then((outcome) => {
      if (cancelled) return;
      const fresh = outcome.ok ? outcome.data : undefined;
      setChoices((had) => fresh ?? (Array.isArray(had) ? had : "failed"));
    });
    return () => {
      cancelled = true;
    };
  }, [open, guarded]);
  return choices;
}

/**
 * The customers this person may raise a direct load for. A failure is an empty
 * list rather than an error: the papers he may send against still come with the
 * screen, and Direct is simply not offered until the next open.
 */
function useDirectCompanies(enabled: boolean): SelectOption[] | null {
  const guarded = useWireGuard();
  const [companies, setCompanies] = useState<SelectOption[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    guarded(directCompaniesAction)().then((outcome) => {
      if (!cancelled) setCompanies(outcome.ok ? (outcome.data ?? []) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, guarded]);
  return companies;
}

/** A line's sheet as the live comparison reads it: the lookups by id, the figures as typed. */
function sheetOf(line: DraftLine): SheetValues {
  return {
    colourCode: line.colourCode,
    supplier: line.supplierId,
    fireRating: line.fireRatingId,
    class: line.classId,
    thickness: line.thicknessId,
    width: line.width,
    length: line.length,
    pricePerSqm: line.pricePerSqm,
  };
}

/** What the hidden `items` field carries: each line's origin and its nine inputs as typed. */
function linesPayload(lines: readonly LoadDraft[]): string {
  return JSON.stringify(
    lines.map((line) => ({
      quotationItemId: line.quotationItemId,
      colourCode: line.colourCode,
      supplierId: line.supplierId,
      fireRatingId: line.fireRatingId,
      classId: line.classId,
      thicknessId: line.thicknessId,
      qty: line.qty,
      width: line.width,
      length: line.length,
      pricePerSqm: line.pricePerSqm,
    })),
  );
}

/** And the `services` field: each service's origin and its three inputs. */
function servicesPayload(services: readonly ServiceDraft[]): string {
  return JSON.stringify(
    services.map((service) => ({
      quotationServiceId: carriedFrom(service.key),
      serviceId: service.serviceId,
      sqm: service.sqm,
      pricePerSqm: service.pricePerSqm,
    })),
  );
}

function LoadForm({
  mode,
  existing,
  fixedQuotation,
  fixedCompany,
  targets,
  own,
  onBehalf,
  dispatchLists,
  lineLists,
  serviceChoices,
  onSaved,
  onCancel,
}: {
  mode: DispatchMode;
  existing?: DispatchDraft;
  fixedQuotation: { id: string; label: string } | null;
  fixedCompany: { id: string; name: string } | null;
  targets?: DispatchTargets;
  /** The customers Direct may be chosen for. */
  own: SelectOption[];
  /** The "For" field's answers; null where it is not asked. */
  onBehalf: DispatchOnBehalf | null;
  dispatchLists: DispatchLookups;
  lineLists: QuotationLookups;
  serviceChoices: SelectOption[];
  onSaved: (dispatchId: string | undefined) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const guarded = useWireGuard();
  const { submit, pending, error, fieldErrors, answer } = useSubmitAction(
    ACTIONS[mode],
    (data) => onSaved(data?.dispatchId),
  );

  // A long form — lines, services, totals, and the terms under them — so a
  // sentence beside one field is a sentence a rep on a phone may never reach.
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(form, answer);

  /* ---- who, and where it comes from ------------------------------------ */

  /*
   * Each answer carries the question it answered, and is compared rather than
   * reset: choosing another customer leaves the earlier choice of paper behind
   * without a setState in an effect, which is the cascading render the lint
   * refuses (the quotation dialog's credit and contact fields do the same).
   */
  const [pickedCompany, setPickedCompany] = useState("");
  const [sourcePick, setSourcePick] = useState<{ companyId: string; value: string } | null>(null);

  /*
   * Whom it is for (SPEC §3 P13), first, because the customers and the papers
   * offered under it are THAT person's — `dispatchTargets` and the direct
   * customers, read with his id. On a quotation's drawer the paper is fixed, so
   * the answers narrow instead: whoever may send against it. Opens on Internal
   * Sales where hers is an answer, else on the paper's own rep. Choosing
   * somebody clears the customer and the source, in the setter.
   */
  const eligible = useMemo(() => (onBehalf ? dispatchEligible(onBehalf) : []), [onBehalf]);
  const [forPick, setForPick] = useState<string | null>(null);
  const raisedFor = onBehalf ? (forPick ?? openingFor(eligible, onBehalf.suggested)) : "";
  const theirs = onBehalf ? onBehalf.targets[raisedFor] : null;
  const shownTargets = onBehalf ? theirs : targets;
  const shownOwn = useMemo(
    () => (onBehalf ? (theirs?.direct ?? []) : own),
    [onBehalf, theirs, own],
  );

  const [prefill, setPrefill] = useState<{ quotationId: string; data: DispatchPrefill | null } | null>(
    null,
  );

  const lockedSource = existing ? (existing.quotationId ?? DIRECT) : (fixedQuotation?.id ?? null);
  const loadedPaper = lockedSource && lockedSource !== DIRECT && prefill?.quotationId === lockedSource
    ? prefill.data
    : null;
  const company =
    existing?.companyId ?? fixedCompany?.id ?? (fixedQuotation ? (loadedPaper?.companyId ?? "") : pickedCompany);

  const companyOptions = useMemo(() => {
    const byId = new Map<string, SelectOption>();
    for (const option of [...(shownTargets?.companies ?? []), ...shownOwn]) byId.set(option.value, { value: option.value, label: option.label });
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [shownTargets, shownOwn]);

  // This customer's papers, newest first, as the screen sent them — the latest
  // is the one a rep means nine times in ten, so it is the one chosen for him.
  const papers = useMemo(
    () =>
      (shownTargets?.quotations ?? []).flatMap((option) => {
        const split = splitOption(option.value);
        return split && split.companyId === company
          ? [{ value: split.id, label: option.label, hint: option.hint }]
          : [];
      }),
    [shownTargets, company],
  );
  const mayDirect = shownOwn.some((option) => option.value === company);
  const sourceOptions: SelectOption[] = [
    ...papers,
    ...(mayDirect
      ? // Its meaning is the sentence under the field once chosen, not a hint
        // repeated beside the word in the field itself.
        [{ value: DIRECT, label: t("dispatches.direct") }]
      : []),
  ];

  const source =
    lockedSource ??
    (company
      ? sourcePick?.companyId === company
        ? sourcePick.value
        : (sourceOptions[0]?.value ?? "")
      : "");
  const quotation = source && source !== DIRECT ? source : null;

  useEffect(() => {
    if (!quotation) return;
    let cancelled = false;
    guarded(dispatchPrefillAction)({ quotationId: quotation, dispatchId: existing?.dispatchId }).then(
      (outcome) => {
        if (!cancelled) setPrefill({ quotationId: quotation, data: outcome.ok ? (outcome.data ?? null) : null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [quotation, existing?.dispatchId, guarded]);

  /** Undefined while it is on its way, null if it could not be read. */
  const paper: DispatchPrefill | null | undefined = quotation
    ? prefill?.quotationId === quotation
      ? prefill.data
      : undefined
    : null;

  /*
   * Who this one may count for (D148), read for the paper's job the way the
   * paper is. A direct load has no job and asks nothing: it counts for the man
   * raising it. A failure here is not an error a rep should see — the question
   * is simply not asked.
   */
  // Keyed on the person too: on a load she raises for him the pool is his, and
  // his name is the answer it opens on (SPEC §3 P13).
  const [credit, setCredit] = useState<{ key: string; choices: CreditChoices | null } | null>(
    null,
  );
  useEffect(() => {
    if (!quotation) return;
    const key = `${quotation}|${raisedFor}`;
    let cancelled = false;
    guarded(creditChoicesAction)({ quotationId: quotation, repId: raisedFor || undefined }).then(
      (outcome) => {
        if (!cancelled) setCredit({ key, choices: outcome.ok ? (outcome.data ?? null) : null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [quotation, raisedFor, guarded]);
  const creditChoices =
    quotation && credit?.key === `${quotation}|${raisedFor}` ? credit.choices : null;
  const [creditPick, setCreditPick] = useState<{ source: string; value: string } | null>(
    existing?.creditTo ? { source: `${existing.quotationId ?? DIRECT}|`, value: existing.creditTo } : null,
  );
  const creditSource = `${source}|${raisedFor}`;
  const countsFor =
    (creditPick?.source === creditSource ? creditPick.value : "") || creditChoices?.mine || "";

  /* ---- the load --------------------------------------------------------- */

  const carried = useMemo(
    () =>
      new Map<string, CarriedFacts>(
        (paper?.lines ?? []).map((line) => [line.quotationItemId, { position: line.position, left: line.left }]),
      ),
    [paper],
  );
  const base = Math.max(0, ...(paper?.lines ?? []).map((line) => line.position));

  /*
   * What the load opens on, for the source in hand: an edit on what it already
   * says; a paper on every line with something left on it, the quantity at what
   * is left, and on every service; Direct on one empty line. Derived until the
   * rep touches it, and his version is kept against the source it was typed for.
   */
  const sourceKey = `${company}:${source}`;
  const openingLines = useMemo((): LoadDraft[] => {
    if (existing) {
      return existing.lines.map((line, index) => ({
        ...line,
        key: line.quotationItemId ? `${CARRIED}${line.quotationItemId}` : `own-${index}`,
      }));
    }
    if (paper) {
      const carriedLines = paper.lines
        .filter((line) => line.left > 0)
        .map((line) => ({
          ...line.draft,
          qty: String(line.left),
          key: `${CARRIED}${line.quotationItemId}`,
          quotationItemId: line.quotationItemId,
        }));
      if (carriedLines.length > 0) return carriedLines;
    }
    return [{ ...blankLine(lineLists), quotationItemId: null }];
  }, [existing, paper, lineLists]);
  const openingServices = useMemo((): ServiceDraft[] => {
    if (existing) {
      return existing.services.map((service, index) => ({
        serviceId: service.serviceId,
        sqm: service.sqm,
        pricePerSqm: service.pricePerSqm,
        key: service.quotationServiceId ? `${CARRIED}${service.quotationServiceId}` : `own-${index}`,
      }));
    }
    return (paper?.services ?? []).map((service) => ({
      ...service.draft,
      key: `${CARRIED}${service.quotationServiceId}`,
    }));
  }, [existing, paper]);

  const [linesPick, setLinesPick] = useState<{ key: string; lines: LoadDraft[] } | null>(null);
  const [servicesPick, setServicesPick] = useState<{ key: string; services: ServiceDraft[] } | null>(
    null,
  );
  const lines = linesPick?.key === sourceKey ? linesPick.lines : openingLines;
  const services = servicesPick?.key === sourceKey ? servicesPick.services : openingServices;

  const totals = useMemo(() => quotationTotals(lines, services), [lines, services]);

  /*
   * The services this load already names, with their names — the paper's, and on
   * an edit the load's own. The form's list is what the admin offers TODAY, and a
   * carried service he has switched off since is still what the customer was
   * quoted, and still accepted on the row it came on. Read against today's list
   * alone that row said "Choose…", and a rep would have chosen something else and
   * recorded a difference nobody made. So the row that carries it offers it, by
   * name and marked as no longer offered; no other row does, because the action
   * refuses it anywhere else.
   */
  const offered = useMemo(() => new Set(serviceChoices.map((choice) => choice.value)), [serviceChoices]);
  const namedOnLoad = useMemo(() => {
    const names = new Map<string, string>();
    for (const service of existing?.services ?? []) names.set(service.serviceId, service.name);
    for (const service of paper?.services ?? []) names.set(service.draft.serviceId, service.name);
    return names;
  }, [existing, paper]);
  const paperServiceOf = useMemo(
    () => new Map((paper?.services ?? []).map((service) => [service.quotationServiceId, service.draft.serviceId])),
    [paper],
  );
  const notOffered = t("dispatches.serviceNotOffered");
  const serviceChoicesFor = (service: ServiceDraft): SelectOption[] => {
    const origin = carriedFrom(service.key);
    const kept = new Set([service.serviceId, origin ? (paperServiceOf.get(origin) ?? "") : ""]);
    const withdrawn = [...kept].flatMap((id) => {
      const name = namedOnLoad.get(id);
      return id && name && !offered.has(id) ? [{ value: id, label: name, hint: notOffered }] : [];
    });
    return withdrawn.length > 0 ? [...serviceChoices, ...withdrawn] : serviceChoices;
  };

  /*
   * Whether this load is still what its paper says, asked of the same function
   * the action records the difference with — on ids and typed figures here,
   * where the action compares the words it reads from the rows. The form only
   * needs yes or no; what exactly differs is the drawer's to say.
   */
  const differs = useMemo(() => {
    if (!paper) return false;
    const numbers = lineNumbers(lines, carried, base);
    return (
      differenceFrom(
        {
          lines: paper.lines.map((line) => ({
            id: line.quotationItemId,
            position: line.position,
            ...sheetOf(line.draft),
          })),
          services: paper.services.map((service) => ({
            id: service.quotationServiceId,
            position: service.position,
            service: service.draft.serviceId,
            sqm: service.draft.sqm,
            pricePerSqm: service.draft.pricePerSqm,
          })),
        },
        {
          lines: lines.map((line, index) => ({
            quotationItemId: line.quotationItemId,
            position: numbers[index],
            ...sheetOf(line),
          })),
          services: services.map((service, index) => ({
            quotationServiceId: carriedFrom(service.key),
            position: index + 1,
            service: service.serviceId,
            sqm: service.sqm,
            pricePerSqm: service.pricePerSqm,
          })),
        },
      ).length > 0
    );
  }, [paper, lines, services, carried, base]);

  // The paper's lines with nothing left on them, which the load does not open
  // on — named, so a rep who counts the lines is not left wondering where one went.
  const sentInFull = (paper?.lines ?? [])
    .filter((line) => line.left === 0 && !lines.some((row) => row.quotationItemId === line.quotationItemId))
    .map((line) => t("quotations.itemNumber", { number: line.position }))
    .join(" · ");

  /* ---- how, where and on what terms ------------------------------------- */

  const [method, setMethod] = useState(existing?.shipmentMethodId ?? dispatchLists.defaultMethod ?? "");
  // The store opens on the paper's, which the price was worked out of — a child
  // reading its own parent (D159) — and a rep changes it when the panels come out
  // of another.
  const [warehousePick, setWarehousePick] = useState<string | null>(existing?.warehouseId ?? null);
  const warehouse = warehousePick ?? paper?.warehouseId ?? dispatchLists.defaultWarehouse ?? "";
  const [destination, setDestination] = useState(existing?.destination ?? "");
  /*
   * How it is being paid for (SPEC §3, P13): three answers, the second question
   * two of them ask, and the note credit needs. A new load starts on nothing —
   * "which of these" has no sensible default, and nothing on these fields is
   * written for him: no placeholder, no example terms (SPEC §3).
   */
  const [terms, setTerms] = useState<PaymentTerms | "">(existing?.paymentTerms ?? "");
  const [detail, setDetail] = useState<PaymentDetail | "">(existing?.paymentDetail ?? "");
  const [paymentNote, setPaymentNote] = useState(existing?.paymentNote ?? "");
  const seconds = terms ? detailsFor(terms) : [];

  const label = paper?.label ?? existing?.quotationLabel ?? fixedQuotation?.label ?? "";
  // "Differs from 4541": the paper by SMAC's number where it has one, as the
  // chip, the drawer and the trail name it — one paper, one name (D179).
  const paperName = paper ? (paper.smacNumber ?? paper.label) : label;

  return (
    <form
      ref={form}
      action={submit}
      // The browser's own validation is off: it refuses the submit before the
      // action runs and answers in the BROWSER's language (DESIGN §5).
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      {mode === "request" ? (
        <>
          <input type="hidden" name="companyId" value={company} />
          {quotation ? <input type="hidden" name="quotationId" value={quotation} /> : null}
        </>
      ) : (
        <input type="hidden" name="dispatchId" value={existing?.dispatchId ?? ""} />
      )}
      <input type="hidden" name="items" value={linesPayload(lines)} />
      <input type="hidden" name="services" value={servicesPayload(services)} />
      <input type="hidden" name="shipmentMethodId" value={method} />
      <input type="hidden" name="warehouseId" value={warehouse} />
      <input type="hidden" name="credit" value={countsFor} />
      {onBehalf ? <input type="hidden" name="repId" value={raisedFor} /> : null}

      <FormBody>
        {/* Whom it is for, first and on a row of its own (SPEC §3 P13), one
            column wide on the band's grid so it lines up with the customer. */}
        {onBehalf ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RaisedForField
              people={onBehalf.people}
              eligible={eligible}
              value={raisedFor}
              onChange={(value) => {
                setForPick(value);
                setPickedCompany("");
                setSourcePick(null);
              }}
              disabled={pending}
              error={fieldErrors.repId}
            />
            {eligible.length === 0 ? (
              <p className="self-end text-sm text-muted-foreground sm:col-span-1 lg:col-span-3">
                {t("common.onBehalf.nobodyMay")}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Who, where from, and how it leaves: one-line answers about the whole
            load, four across on the desk dialog (as on the quotation's). */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label id="dispatch-company-label">{t("common.company")}</Label>
            {existing || fixedCompany || fixedQuotation ? (
              // Fixed where it was opened from: a load from a customer's drawer,
              // a paper's, or one being corrected cannot move to another customer.
              <SearchableSelect
                aria-labelledby="dispatch-company-label"
                options={
                  company
                    ? [{ value: company, label: existing?.companyName ?? fixedCompany?.name ?? loadedPaper?.companyName ?? "" }]
                    : []
                }
                value={company}
                onChange={() => undefined}
                disabled
                placeholder={t("common.company")}
                searchPlaceholder={t("forms.searchList")}
                emptyText={t("forms.noMatch")}
              />
            ) : (
              <SearchableSelect
                aria-labelledby="dispatch-company-label"
                options={companyOptions}
                value={pickedCompany}
                onChange={setPickedCompany}
                // Nothing to choose until she has said whom it is for.
                disabled={pending || Boolean(onBehalf && !raisedFor)}
                placeholder={t("common.pickCompany")}
                searchPlaceholder={t("forms.searchList")}
                emptyText={t("forms.noMatch")}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label id="dispatch-source-label">{t("dispatches.source")}</Label>
            <SearchableSelect
              aria-labelledby="dispatch-source-label"
              options={
                lockedSource
                  ? [
                      lockedSource === DIRECT
                        ? { value: DIRECT, label: t("dispatches.direct") }
                        : { value: lockedSource, label, hint: paper?.projectName },
                    ]
                  : sourceOptions
              }
              value={source}
              onChange={(value) => setSourcePick({ companyId: company, value })}
              // A paper already fixed is not a choice; nor is anything before a
              // customer is named.
              disabled={pending || Boolean(lockedSource) || !company}
              placeholder={company ? t("dispatches.pickSource") : t("common.pickCompanyFirst")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
            {/* A paper names its job in the choice itself; Direct says what it means. */}
            {source === DIRECT ? (
              <p className="text-xs text-muted-foreground">{t("dispatches.directHint")}</p>
            ) : null}
          </div>

          {/* Where it leaves from, before how it travels: the store is decided
              before the truck is (SPEC §3, P12-9). */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label id="dispatch-warehouse-label">{t("common.warehouse")}</Label>
            <SearchableSelect
              aria-labelledby="dispatch-warehouse-label"
              options={dispatchLists.warehouses}
              value={warehouse}
              onChange={setWarehousePick}
              disabled={pending}
              invalid={fieldErrors.warehouseId ? true : undefined}
              aria-describedby={fieldErrors.warehouseId ? "dispatch-warehouse-error" : undefined}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
            {fieldErrors.warehouseId ? (
              <p id="dispatch-warehouse-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.warehouseId}
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label id="shipment-label">{t("common.shipment")}</Label>
            <SearchableSelect
              aria-labelledby="shipment-label"
              options={dispatchLists.shipmentMethods}
              value={method}
              onChange={setMethod}
              disabled={pending}
              invalid={fieldErrors.shipmentMethodId ? true : undefined}
              aria-describedby={fieldErrors.shipmentMethodId ? "shipment-error" : undefined}
              placeholder={t("forms.choose")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
            {fieldErrors.shipmentMethodId ? (
              <p id="shipment-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.shipmentMethodId}
              </p>
            ) : null}
          </div>
        </div>

        {!source ? (
          /* Both steps in one sentence: the load has nothing to open on until
             the customer and its source are named. */
          <p className="text-sm text-muted-foreground">{t("dispatches.pickQuotationFirst")}</p>
        ) : paper === undefined ? (
          // The lines' own shape while the paper is read: a table head, three
          // rows, and the services and totals beside each other under them.
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : quotation && paper === null ? (
          <p role="alert" className="text-sm text-destructive">
            {t("forms.listsUnavailable")}
          </p>
        ) : (
          <>
            <DispatchLines
              lookups={lineLists}
              lines={lines}
              carried={carried}
              base={base}
              paper={Boolean(paper)}
              onChange={(next) => setLinesPick({ key: sourceKey, lines: next })}
              disabled={pending}
              refused={lineRefusal("items", fieldErrors)}
            />
            {sentInFull ? (
              <p data-slot="sent-in-full" className="text-xs text-muted-foreground">
                {t("dispatches.sentInFull", { items: sentInFull })}
              </p>
            ) : null}

            {/* The services under the panels, and what the whole load comes to
                beside them on a desk or under them on a phone — the totals are
                money.ts's, the same five figures the quotation's are (SPEC §3). */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-6">
              <QuotationServices
                choices={serviceChoices}
                choicesFor={serviceChoicesFor}
                services={services}
                subtotal={totals.services}
                onChange={(next) => setServicesPick({ key: sourceKey, services: next })}
                disabled={pending}
                refused={lineRefusal("services", fieldErrors)}
              />
              <QuotationTotals
                sqm={totals.sqm}
                split={{ panels: totals.panels, services: totals.services }}
                subtotal={totals.subtotal}
                vat={totals.vat}
                total={totals.total}
              />
            </div>

            {/* Said the moment it is true, with the amber dot of "somebody will
                look at this", and in words: the colour is never the only carrier. */}
            {differs ? (
              <ToneNote tone="wait" role="status" slot="form-differs" className="text-sm">
                {t("dispatches.formDiffers", { label: paperName })}
              </ToneNote>
            ) : null}

            {/* Under the figure it decides: this many metres, and they count
                for him (D148). */}
            <CreditField
              people={creditChoices?.people ?? []}
              value={countsFor}
              onChange={(next) => setCreditPick({ source: creditSource, value: next })}
              sqm={totals.sqm}
              id="dispatch-credit"
            />
          </>
        )}

        {/* Where it goes and how it is paid for, as one labelled group (DESIGN
            §8): a small word over an inset, under the same word the drawer reads
            it back under, and a step of space past the load above it. */}
        <section aria-labelledby="dispatch-terms-label" className="flex flex-col gap-2 pt-2">
          <h3 id="dispatch-terms-label" className="text-xs font-medium text-muted-foreground">
            {t("dispatches.terms")}
          </h3>
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dispatch-destination">{t("common.destination")}</Label>
              <Input
                id="dispatch-destination"
                name="destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                disabled={pending}
                placeholder={t("dispatches.destinationPlaceholder")}
                aria-invalid={fieldErrors.destination ? true : undefined}
                aria-describedby={fieldErrors.destination ? "dispatch-destination-error" : undefined}
              />
              {fieldErrors.destination ? (
                <p id="dispatch-destination-error" role="alert" className="text-xs text-destructive">
                  {fieldErrors.destination}
                </p>
              ) : null}
            </div>

            {/* How it is being paid for (SPEC §3): the choice, then the question
                that choice asks, then the note finance reads on credit. Chips,
                because three short answers a rep knows by heart are a row he
                presses, not a list he opens. */}
            <div className="flex flex-col gap-3">
              <ChoiceChips
                legend={t("common.paymentTerms")}
                name="paymentTerms"
                value={terms}
                choices={PAYMENT_TERMS.map((value) => ({
                  value,
                  label: paymentTermsLabel(value, t),
                }))}
                onChange={(next) => {
                  setTerms(next);
                  // The second question is a different question for each of them,
                  // so an answer to the last one is not an answer to this one.
                  setDetail("");
                }}
                disabled={pending}
                error={fieldErrors.paymentTerms}
                errorId="dispatch-terms-error"
              />

              {terms && seconds.length > 0 ? (
                <ChoiceChips
                  legend={t(detailLegendKey(terms))}
                  name="paymentDetail"
                  value={detail}
                  choices={seconds.map((value) => ({ value, label: paymentDetailLabel(value, t) }))}
                  onChange={setDetail}
                  disabled={pending}
                  error={fieldErrors.paymentDetail}
                  errorId="dispatch-detail-error"
                />
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dispatch-payment-note">{t("common.paymentNote")}</Label>
                <Textarea
                  id="dispatch-payment-note"
                  name="paymentNote"
                  rows={2}
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                  disabled={pending}
                  aria-invalid={fieldErrors.paymentNote ? true : undefined}
                  aria-describedby={
                    fieldErrors.paymentNote
                      ? "dispatch-payment-note-error"
                      : terms && needsNote(terms)
                        ? "dispatch-payment-note-hint"
                        : undefined
                  }
                />
                {/* Why it is not optional on credit, in the founder's own reason:
                    finance reviews it. Said once — as the hint before a save, as
                    the refusal after one. */}
                {fieldErrors.paymentNote ? (
                  <p id="dispatch-payment-note-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.paymentNote}
                  </p>
                ) : terms && needsNote(terms) ? (
                  <p id="dispatch-payment-note-hint" className="text-xs text-muted-foreground">
                    {t("dispatches.payment.noteRequired")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onCancel} />
    </form>
  );
}
