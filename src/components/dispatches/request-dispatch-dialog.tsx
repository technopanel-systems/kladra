"use client";

import { Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  creditChoicesAction,
  remainingItemsAction,
  type CreditChoices,
  type DispatchLookups,
} from "@/actions/forms";
import { requestDispatchAction, updateDispatchAction } from "@/actions/dispatches";
import {
  DispatchItems,
  itemsPayload,
  sendingSqm,
  type SendDraft,
} from "@/components/dispatches/dispatch-items";
import { ChoiceChips } from "@/components/ui-ext/choice-chips";
import { CreditField } from "@/components/ui-ext/credit-field";
import { useSubmitAction, useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { useDispatchLookups } from "@/components/ui-ext/form-lookups";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { DialogFormSkeleton, ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { RemainingItem } from "@/lib/dispatches";
import { splitOption, type DispatchTargets } from "@/lib/picker-option";
import { formatSqm } from "@/lib/money";
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

/**
 * Raise a dispatch against an issued quotation, or change one still waiting
 * (SPEC §3, S37–S40).
 *
 * The same dialog does both, for the reason the quotation's does: a rep asked
 * to retype the whole thing to change one quantity sends it on WhatsApp instead
 * (S54).
 *
 * What is left on each line is fetched every time this opens, never cached —
 * another dispatch raised a minute ago has already spent some of it (D12).
 *
 * From P8 the quotation can be the first FIELD instead of the context, so the
 * Dispatches screen has a primary action of its own (SPEC §3, P8). The list it
 * offers is only quotations with something still on them, so a rep cannot pick
 * one and then find every line at zero.
 *
 * And from P12-10 it asks the chain in the order he has it: the customer, then
 * that customer's papers with the job on the row. It was one flat list of every
 * dispatchable quotation in the building — a number over a job name — which is
 * the middle of the chain, and the same finding the Quotations screen answered
 * one phase earlier (P12-9). The customer is what a rep arranging a load knows.
 */

export type DispatchDraft = {
  dispatchId: string;
  shipmentMethodId: string;
  /** Which store it leaves from (SPEC §3, P12-9). */
  warehouseId: string;
  destination: string;
  paymentTerms: PaymentTerms;
  paymentDetail: PaymentDetail | null;
  paymentNote: string | null;
  /** Quantities already on this request, by quotation line. */
  sending: { quotationItemId: string; qty: number }[];
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
  targets,
  mode = "request",
  existing,
  trigger,
}: {
  /** Known when the dialog is opened from a quotation's drawer. */
  quotationId?: string;
  /** Q-12 — named in the title, because a dispatch is always against one. */
  quotationLabel?: string;
  /**
   * The customers and their papers, offered as the first two fields when the
   * quotation is NOT known (P12-10).
   */
  targets?: DispatchTargets;
  mode?: DispatchMode;
  existing?: DispatchDraft;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const guarded = useWireGuard();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useDispatchLookups(open);
  const [items, setItems] = useState<RemainingItem[] | null>(null);
  /**
   * The store the quotation was priced out of (SPEC §3, P12-9), which is what
   * the store field opens on. `undefined` is "not answered yet": the form reads
   * it once, on mount, so mounting it while the answer is in flight would leave
   * the field on the first store in the list and never correct itself.
   */
  const [quoted, setQuoted] = useState<string | undefined>(undefined);
  const [itemsFailed, setItemsFailed] = useState(false);
  /*
   * Customer → quotation, the order a rep has the answers in (P12-10, and the
   * quotation dialog's own company → project → contact one phase earlier).
   *
   * Choosing a customer clears the paper, because a paper belongs to a customer
   * and a stale one would be a load raised against the wrong record. Done in
   * the SETTER rather than in an effect: clearing state as a consequence of
   * other state is the cascading render the lint refuses, and the value is
   * already in hand at the moment of the choice.
   */
  const [pickedCompany, setPickedCompany] = useState("");
  const [chosen, setChosen] = useState("");
  /**
   * Who this one may count for (D148), read when the dialog opens for the same
   * reason what-is-left is: a rep can be put on the job or taken off it while
   * the screen sits there. `undefined` is "not answered yet" and the form waits
   * for it, because a field that appears after the form has mounted is a field
   * a rep has already scrolled past.
   */
  const [credit, setCredit] = useState<CreditChoices | null | undefined>(undefined);

  // The quotation the form is being built for: the caller's, or the one picked
  // in the field above it. A picked option carries its customer with it, so the
  // id has to be taken out of it before anything asks the server about it.
  const active = quotationId ?? splitOption(chosen)?.id ?? null;

  // This customer's papers. Filtered here rather than fetched again: the whole
  // list came down with the screen, and a rep with a driver waiting should not
  // wait for a round trip between two fields.
  const papers = useMemo(
    () =>
      (targets?.quotations ?? []).filter(
        (option) => splitOption(option.value)?.companyId === pickedCompany,
      ),
    [targets, pickedCompany],
  );

  // Closing clears what was fetched; opening fetches it again. Done in the
  // handler rather than in the effect, because "reset on close" as an effect is
  // a setState the moment a render happens for any other reason.
  const change = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setItems(null);
      setQuoted(undefined);
      setItemsFailed(false);
      setPickedCompany("");
      setChosen("");
      setCredit(undefined);
    }
  }, []);

  useEffect(() => {
    if (!open || !active) return;
    let cancelled = false;
    guarded(remainingItemsAction)(active, existing?.dispatchId).then((outcome) => {
      if (cancelled) return;
      if (outcome.ok && outcome.data) {
        setItems(outcome.data.items);
        setQuoted(outcome.data.warehouseId);
      } else setItemsFailed(true);
    });
    // A failure here is not an error the rep should see: the question simply is
    // not asked, and the metres go to the man raising it, which is what they
    // did before this existed.
    guarded(creditChoicesAction)({ quotationId: active }).then((outcome) => {
      if (cancelled) return;
      setCredit(outcome.ok ? (outcome.data ?? null) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, active, existing?.dispatchId, mode, guarded]);

  const onSaved = useCallback(
    (dispatchId: string | undefined) => {
      toast.success(t(mode === "edit" ? "dispatches.updated" : "dispatches.requested"));
      change(false);
      if (dispatchId) router.push(`/dispatches?open=${dispatchId}`);
      else router.refresh();
    },
    [change, mode, router, t],
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={change}
      title={
        mode === "edit"
          ? t("dispatches.editRequest")
          : quotationLabel
            ? t("dispatches.requestFor", { label: quotationLabel })
            : t("dispatches.request")
      }
      description={t("dispatches.requestHint")}
      trigger={
        trigger ?? (
          <Button variant="outline">
            <Truck aria-hidden="true" />
            {t("dispatches.request")}
          </Button>
        )
      }
    >
      {targets ? (
        <div className="flex flex-col gap-3 px-4 pt-1 pb-3">
          <div className="flex flex-col gap-1.5">
            <Label id="dispatch-company-label">{t("common.company")}</Label>
            <SearchableSelect
              aria-labelledby="dispatch-company-label"
              options={targets.companies}
              value={pickedCompany}
              // The paper goes with the customer, and so does everything the
              // form has fetched about the one before it.
              onChange={(next) => {
                setItems(null);
                setItemsFailed(false);
                setCredit(undefined);
                setChosen("");
                setPickedCompany(next);
              }}
              placeholder={t("common.pickCompany")}
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("forms.noMatch")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label id="dispatch-quotation-label">{t("common.quotation")}</Label>
            <SearchableSelect
              aria-labelledby="dispatch-quotation-label"
              options={papers}
              value={chosen}
              // What is left belongs to the quotation, so the previous answer is
              // about a different one. Cleared here rather than in the effect:
              // "reset when the input changes" as an effect is a setState that
              // runs on every other render too (DESIGN §5).
              onChange={(next) => {
                setItems(null);
                setItemsFailed(false);
                setCredit(undefined);
                setChosen(next);
              }}
              // Nothing to choose from until a customer is named: a list of
              // every open paper in the building is what this field used to be.
              disabled={!pickedCompany}
              placeholder={
                pickedCompany ? t("dispatches.pickQuotation") : t("common.pickCompanyFirst")
              }
              searchPlaceholder={t("forms.searchList")}
              emptyText={t("dispatches.noQuotations")}
            />
          </div>
        </div>
      ) : null}

      {failed || itemsFailed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : active === null ? (
        /* Both steps in one sentence (P12-10). It said "choose the quotation"
           over a field that will not open until a customer is named, which is
           the screen telling a rep to do the one thing it is refusing. */
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          {t("dispatches.pickQuotationFirst")}
        </p>
      ) : lookups && items && credit !== undefined ? (
        <DispatchForm
          quotationId={active}
          mode={mode}
          existing={existing}
          credit={credit}
          lookups={lookups}
          items={items}
          quotedWarehouse={quoted ?? null}
          onSaved={onSaved}
          onCancel={() => change(false)}
        />
      ) : (
        <DialogFormSkeleton rows={5} />
      )}
    </ResponsiveDialog>
  );
}

function DispatchForm({
  quotationId,
  mode,
  existing,
  quotedWarehouse,
  credit,
  lookups,
  items,
  onSaved,
  onCancel,
}: {
  quotationId: string;
  mode: DispatchMode;
  existing?: DispatchDraft;
  /** Who it may count for, or null where the job has one rep and nothing is asked. */
  credit: CreditChoices | null;
  /** The store the quotation was priced out of, which this opens on (P12-9). */
  quotedWarehouse: string | null;
  lookups: DispatchLookups;
  items: RemainingItem[];
  onSaved: (dispatchId: string | undefined) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const { submit, pending, error, fieldErrors, answer } = useSubmitAction(
    ACTIONS[mode],
    (data) => onSaved(data?.dispatchId),
  );

  // Three required boxes sit below a scrolling list of lines, so a message only
  // beside one of them is a message a rep on a phone never reaches.
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(form, answer);

  const [lines, setLines] = useState<SendDraft[]>(() => {
    const already = new Map(existing?.sending.map((row) => [row.quotationItemId, row.qty]) ?? []);
    return items.map((item) => ({
      quotationItemId: item.quotationItemId,
      qty: already.has(item.quotationItemId) ? String(already.get(item.quotationItemId)) : "",
    }));
  });
  /*
   * Every answer on this form is typed for THIS load (SPEC §3, overruling D81).
   *
   * It used to open on the last dispatch raised against the same quotation —
   * its site, its terms, its shipment method — on the argument that those
   * belong to the job rather than to the load. The founder's rule is flatter
   * than the argument: nothing is ever carried forward from a previous record
   * into a new one, and a note typed on one dispatch must not appear prefilled
   * on the next. So the read behind it is gone rather than merely unused.
   *
   * `existing` wins, because an EDIT is not a new record: it opens on what it
   * already says. The rest opens on the lookups' own defaults, and the store on
   * its quotation's, which is a child reading its own parent (D159).
   */
  const [method, setMethod] = useState(
    existing?.shipmentMethodId ?? lookups.defaultMethod ?? "",
  );
  /*
   * Which store this load leaves from (SPEC §3). It opens on the QUOTATION's,
   * which is the store the price was worked out of and the answer nine times
   * in ten — and the tenth is why it is a field: a store that is short sends
   * the panels from the next one along.
   *
   * The parent's own value, which is the one thing on this form that does come
   * from somewhere else: a dispatch reading its quotation is a child reading the
   * record it hangs off, the way its lines do, and not one record prefilling the
   * next one like it.
   */
  const [warehouse, setWarehouse] = useState(
    existing?.warehouseId ?? quotedWarehouse ?? lookups.defaultWarehouse ?? "",
  );
  const [destination, setDestination] = useState(existing?.destination ?? "");
  /*
   * How it is being paid for (SPEC §3): the choice, the second answer where
   * there is one, and the note the two finance reviews require. A new load
   * starts on nothing — "which of these four" is a question with no sensible
   * default, and a form that answers it for him is a form that gets the wrong
   * answer saved.
   */
  const [terms, setTerms] = useState<PaymentTerms | "">(existing?.paymentTerms ?? "");
  const [detail, setDetail] = useState<PaymentDetail | "">(existing?.paymentDetail ?? "");
  const [paymentNote, setPaymentNote] = useState(existing?.paymentNote ?? "");
  const seconds = terms ? detailsFor(terms) : [];

  /*
   * Whose metres these are (D148). It starts on the man filling the form in,
   * which is the answer for every job one rep works and the answer he wants
   * most of the time on the one he shares — a helper chooses otherwise, and
   * choosing is the whole point of the field.
   */
  const [countsFor, setCountsFor] = useState(existing?.creditTo ?? credit?.mine ?? "");

  const sqm = useMemo(() => sendingSqm(items, lines), [items, lines]);

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
        <input type="hidden" name="quotationId" value={quotationId} />
      ) : (
        <input type="hidden" name="dispatchId" value={existing?.dispatchId ?? ""} />
      )}
      <input type="hidden" name="items" value={itemsPayload(lines)} />
      <input type="hidden" name="shipmentMethodId" value={method} />
      <input type="hidden" name="warehouseId" value={warehouse} />
      <input type="hidden" name="credit" value={countsFor} />

      <FormBody>
        <DispatchItems items={items} lines={lines} onChange={setLines} disabled={pending} />

        <div className="card-face flex items-baseline justify-between gap-4 p-3 text-sm">
          <span className="font-medium">{t("common.sqm")}</span>
          <span dir="ltr" className="num font-semibold" data-slot="figure-sending">
            {formatSqm(sqm)}
          </span>
        </div>

        {/* Directly under the figure it decides, because that is the sentence:
            this many metres, and they count for him (D148). */}
        <CreditField
          people={credit?.people ?? []}
          value={countsFor}
          onChange={setCountsFor}
          sqm={sqm}
          id="dispatch-credit"
        />

        {/* Where it leaves from, above how it travels: the store is decided
            before the truck is (SPEC §3, P12-9). */}
        <div className="flex flex-col gap-1.5">
          <Label id="dispatch-warehouse-label">{t("common.warehouse")}</Label>
          <SearchableSelect
            aria-labelledby="dispatch-warehouse-label"
            options={lookups.warehouses}
            value={warehouse}
            onChange={setWarehouse}
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

        <div className="flex flex-col gap-1.5">
          <Label id="shipment-label">{t("common.shipment")}</Label>
          <SearchableSelect
            aria-labelledby="shipment-label"
            options={lookups.shipmentMethods}
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
            that choice asks, then the note finance reads. Chips rather than a
            dropdown, because four short answers a rep knows by heart are a row
            he presses, not a list he opens. */}
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
              placeholder={t("dispatches.payment.notePlaceholder")}
              aria-invalid={fieldErrors.paymentNote ? true : undefined}
              aria-describedby={
                fieldErrors.paymentNote
                  ? "dispatch-payment-note-error"
                  : terms && needsNote(terms)
                    ? "dispatch-payment-note-hint"
                    : undefined
              }
            />
            {/* Why it is not optional on these two, in the founder's own
                reason: finance reviews them. */}
            {terms && needsNote(terms) ? (
              <p id="dispatch-payment-note-hint" className="text-xs text-muted-foreground">
                {t("dispatches.payment.noteRequired")}
              </p>
            ) : null}
            {fieldErrors.paymentNote ? (
              <p
                id="dispatch-payment-note-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {fieldErrors.paymentNote}
              </p>
            ) : null}
          </div>
        </div>
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onCancel} />
    </form>
  );
}
