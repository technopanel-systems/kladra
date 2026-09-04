"use client";

import { Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { remainingItemsAction, type DispatchLookups } from "@/actions/forms";
import { requestDispatchAction, updateDispatchAction } from "@/actions/dispatches";
import {
  DispatchItems,
  itemsPayload,
  sendingSqm,
  type SendDraft,
} from "@/components/dispatches/dispatch-items";
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
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
import type { PickerOption } from "@/lib/picker-option";
import { formatSqm } from "@/lib/money";

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
 */

export type DispatchDraft = {
  dispatchId: string;
  shipmentMethodId: string;
  destination: string;
  paymentTerms: string;
  /** Quantities already on this request, by quotation line. */
  sending: { quotationItemId: string; qty: number }[];
};

export type DispatchMode = "request" | "edit";

const ACTIONS = {
  request: requestDispatchAction,
  edit: updateDispatchAction,
} as const;

export function RequestDispatchDialog({
  quotationId,
  quotationLabel,
  quotations,
  mode = "request",
  existing,
  trigger,
}: {
  /** Known when the dialog is opened from a quotation's drawer. */
  quotationId?: string;
  /** Q-12 — named in the title, because a dispatch is always against one. */
  quotationLabel?: string;
  /** Offered as the first field when the quotation is NOT known. */
  quotations?: PickerOption[];
  mode?: DispatchMode;
  existing?: DispatchDraft;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { lookups, failed } = useDispatchLookups(open);
  const [items, setItems] = useState<RemainingItem[] | null>(null);
  const [itemsFailed, setItemsFailed] = useState(false);
  const [chosen, setChosen] = useState("");

  // The quotation the form is being built for: the caller's, or the one picked
  // in the field above it.
  const active = quotationId ?? (chosen || null);

  // Closing clears what was fetched; opening fetches it again. Done in the
  // handler rather than in the effect, because "reset on close" as an effect is
  // a setState the moment a render happens for any other reason.
  const change = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setItems(null);
      setItemsFailed(false);
      setChosen("");
    }
  }, []);

  useEffect(() => {
    if (!open || !active) return;
    let cancelled = false;
    remainingItemsAction(active, existing?.dispatchId).then((outcome) => {
      if (cancelled) return;
      if (outcome.ok && outcome.data) setItems(outcome.data);
      else setItemsFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, active, existing?.dispatchId]);

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
      {quotations ? (
        <div className="flex flex-col gap-1.5 px-4 pt-1 pb-3">
          <Label id="dispatch-quotation-label">{t("common.quotation")}</Label>
          <SearchableSelect
            aria-labelledby="dispatch-quotation-label"
            options={quotations}
            value={chosen}
            // What is left belongs to the quotation, so the previous answer is
            // about a different one. Cleared here rather than in the effect:
            // "reset when the input changes" as an effect is a setState that
            // runs on every other render too (DESIGN §5).
            onChange={(next) => {
              setItems(null);
              setItemsFailed(false);
              setChosen(next);
            }}
            placeholder={t("dispatches.pickQuotation")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("dispatches.noQuotations")}
          />
        </div>
      ) : null}

      {failed || itemsFailed ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {t("forms.listsUnavailable")}
        </p>
      ) : active === null ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          {t("dispatches.pickQuotationFirst")}
        </p>
      ) : lookups && items ? (
        <DispatchForm
          quotationId={active}
          mode={mode}
          existing={existing}
          lookups={lookups}
          items={items}
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
  lookups,
  items,
  onSaved,
  onCancel,
}: {
  quotationId: string;
  mode: DispatchMode;
  existing?: DispatchDraft;
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
  const [method, setMethod] = useState(
    existing?.shipmentMethodId ?? lookups.defaultMethod ?? "",
  );
  const [destination, setDestination] = useState(existing?.destination ?? "");
  const [paymentTerms, setPaymentTerms] = useState(existing?.paymentTerms ?? "");

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

      <FormBody>
        <DispatchItems items={items} lines={lines} onChange={setLines} disabled={pending} />

        <div className="card-face flex items-baseline justify-between gap-4 p-3 text-sm">
          <span className="font-medium">{t("common.sqm")}</span>
          <span dir="ltr" className="num font-semibold" data-slot="figure-sending">
            {formatSqm(sqm)}
          </span>
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dispatch-terms">{t("common.paymentTerms")}</Label>
          <Textarea
            id="dispatch-terms"
            name="paymentTerms"
            rows={2}
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.target.value)}
            disabled={pending}
            placeholder={t("dispatches.paymentTermsPlaceholder")}
            aria-invalid={fieldErrors.paymentTerms ? true : undefined}
            aria-describedby={fieldErrors.paymentTerms ? "dispatch-terms-error" : undefined}
          />
          {fieldErrors.paymentTerms ? (
            <p id="dispatch-terms-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.paymentTerms}
            </p>
          ) : null}
        </div>
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onCancel} />
    </form>
  );
}
