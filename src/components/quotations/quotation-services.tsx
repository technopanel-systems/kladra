"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormSection } from "@/components/ui-ext/form-shell";
import { SearchableSelect, type SelectOption } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import type { LineRefusal } from "@/lib/line-refusal";
import { formatMoney, serviceTotal } from "@/lib/money";
import type { DraftService } from "@/lib/quotation-draft";

/**
 * The services on a quotation — CNC cutting, denting, fabrication — in a section
 * of their own under the panels (SPEC §3, P13).
 *
 * Each is a service chosen from the admin's list, the m² it is done over and a
 * price per m², and the row says what it comes to as it is typed, the way a line
 * does. The m² is TYPED: the area a cutting or a fabrication covers is not a
 * sheet's area, so nothing here multiplies anything but the m² by its price.
 * That m² is never a panel metre either — it counts toward no target and no
 * achieved or pipeline figure (D173) — and the sentence under the heading says
 * so, because a rep who sees "m²" beside a number will otherwise expect it on
 * his month.
 *
 * Not the panels' shape (founder, 2026-09-15). A panel line is an item of nine
 * boxes; a service is three answers and a figure, so it is one row of a short
 * list — the service, its m² and its price with their units written in the boxes,
 * then what it comes to — under a heading that carries Add service at its end,
 * and the list closes on the services' subtotal. It was a second copy of the
 * panels' table, with a row of column names over it, and the two read as one
 * spreadsheet in two sizes. The labels are there for a screen reader; the unit in
 * each box is what an eye reads, so the row needs no header.
 *
 * Nothing is offered from a previous quotation (D163): a new request opens with
 * no services, and Add service opens a blank row, because a service's price is
 * the one figure it has and a price a screen fills in is a price nobody checks.
 */

/** One service in the form, plus React's key, which never leaves the browser. */
export type ServiceDraft = DraftService & { key: string };

let counter = 0;

export function blankService(): ServiceDraft {
  counter += 1;
  return { key: `service-${counter}`, serviceId: "", sqm: "", pricePerSqm: "" };
}

/** What the hidden `services` field carries to the action: the three strings as typed. */
export function servicesPayload(services: ServiceDraft[]): string {
  return JSON.stringify(
    services.map((service) => ({
      serviceId: service.serviceId,
      sqm: service.sqm,
      pricePerSqm: service.pricePerSqm,
    })),
  );
}

/**
 * Service, m², price, total, remove — one row on a desk, and on a phone the
 * service across the top with the two boxes under it and the figure under them.
 * The same template on every row, so the boxes line up down the list.
 */
const ROW =
  "grid grid-cols-2 items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_minmax(6.5rem,auto)_2rem]";

export function QuotationServices({
  choices,
  choicesFor,
  services,
  subtotal,
  onChange,
  disabled,
  refused,
}: {
  /** The services the admin offers, in his order (quotationServiceChoicesAction). */
  choices: SelectOption[];
  /**
   * The choices one row offers, where they are not the same for every row. A
   * load carried from its paper may name a service the admin has since switched
   * off, which the dispatch action still accepts on the row it came on (D175 is
   * the quotation's rule, not the load's) — so that row offers it, by name, and
   * no other row does.
   */
  choicesFor?: (service: ServiceDraft) => SelectOption[];
  services: ServiceDraft[];
  /** What they come to together — the same figure the totals block shows. */
  subtotal: number;
  onChange: (services: ServiceDraft[]) => void;
  disabled?: boolean;
  /**
   * The box the action refused, by the row's place in the list as it was sent
   * (src/lib/line-refusal.ts), marked where the caret will go, with the sentence
   * under its row (D43).
   */
  refused?: LineRefusal | null;
}) {
  const t = useTranslations();

  function patch(key: string, change: Partial<ServiceDraft>) {
    onChange(services.map((service) => (service.key === key ? { ...service, ...change } : service)));
  }

  return (
    <FormSection
      data-slot="quotation-services"
      title={t("quotations.services")}
      hint={t("quotations.servicesHint")}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...services, blankService()])}
        >
          <Plus aria-hidden="true" />
          {t("quotations.addService")}
        </Button>
      }
    >
      {services.length > 0 ? (
        <div data-slot="quotation-service-rows" className="card-face flex flex-col divide-y divide-line">
          {services.map((service, index) => {
            const id = (fieldName: string) => `${service.key}-${fieldName}`;
            const refusedHere = refused?.index === index ? refused : null;
            const refusedBox = (name: string) => refusedHere?.field === name;
            const describedBy = (name: string) => (refusedBox(name) ? id("refused") : undefined);
            return (
              <div key={service.key} data-slot="quotation-service">
                <div className={ROW}>
                  {/* Its name for a screen reader, which walks the list by row. */}
                  <h4 className="sr-only">{t("quotations.serviceNumber", { number: index + 1 })}</h4>

                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <Label id={id("service-label")} className="sr-only">
                      {t("quotations.service")}
                    </Label>
                    <SearchableSelect
                      aria-labelledby={id("service-label")}
                      value={service.serviceId}
                      onChange={(value) => patch(service.key, { serviceId: value })}
                      options={choicesFor ? choicesFor(service) : choices}
                      disabled={disabled}
                      invalid={refusedBox("serviceId") || undefined}
                      aria-describedby={describedBy("serviceId")}
                      placeholder={t("quotations.pickService")}
                      searchPlaceholder={t("forms.searchList")}
                      emptyText={t("forms.noMatch")}
                    />
                  </div>

                  <div className="min-w-0">
                    <Label htmlFor={id("sqm")} className="sr-only">
                      {t("common.sqm")}
                    </Label>
                    <InputGroup className="h-9">
                      <InputGroupInput
                        id={id("sqm")}
                        required
                        disabled={disabled}
                        inputMode="decimal"
                        dir="ltr"
                        autoComplete="off"
                        className="num text-start rtl:text-end"
                        value={service.sqm}
                        onChange={(event) => patch(service.key, { sqm: event.target.value })}
                        aria-invalid={refusedBox("sqm") || undefined}
                        aria-describedby={describedBy("sqm")}
                      />
                      <InputGroupAddon align="inline-end" className="font-normal">
                        {t("common.sqm")}
                      </InputGroupAddon>
                    </InputGroup>
                  </div>

                  <div className="min-w-0">
                    <Label htmlFor={id("price")} className="sr-only">
                      {t("common.pricePerSqm")}
                    </Label>
                    <InputGroup className="h-9">
                      <InputGroupInput
                        id={id("price")}
                        required
                        disabled={disabled}
                        inputMode="decimal"
                        dir="ltr"
                        autoComplete="off"
                        className="num text-start rtl:text-end"
                        value={service.pricePerSqm}
                        onChange={(event) => patch(service.key, { pricePerSqm: event.target.value })}
                        aria-invalid={refusedBox("pricePerSqm") || undefined}
                        aria-describedby={describedBy("pricePerSqm")}
                      />
                      <InputGroupAddon align="inline-end" className="font-normal whitespace-nowrap">
                        {t("quotations.sarPerSqm")}
                      </InputGroupAddon>
                    </InputGroup>
                  </div>

                  <span className="min-w-0 text-sm whitespace-nowrap text-muted-foreground sm:text-end">
                    <span className="sr-only">{t("quotations.serviceTotal")} </span>
                    <span dir="ltr" data-slot="service-total" className="num font-medium text-foreground">
                      {formatMoney(serviceTotal(service))}
                    </span>{" "}
                    <span className="text-xs">{t("common.sar")}</span>
                  </span>

                  {/* Any service may go, the last one too: a quotation with no
                      services is the ordinary one. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    onClick={() => onChange(services.filter((row) => row.key !== service.key))}
                    aria-label={t("quotations.removeService")}
                    className="justify-self-end text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>

                {refusedHere ? (
                  <p id={id("refused")} role="alert" className="px-3 pb-2.5 text-xs text-destructive">
                    {refusedHere.message}
                  </p>
                ) : null}
              </div>
            );
          })}

          <p
            data-slot="services-subtotal"
            className="flex items-baseline justify-between gap-4 bg-surface-2 px-3 py-2 text-sm text-muted-foreground"
          >
            <span>{t("quotations.servicesSubtotal")}</span>
            <span className="whitespace-nowrap">
              <span dir="ltr" className="num font-medium text-foreground">
                {formatMoney(subtotal)}
              </span>{" "}
              <span className="text-xs">{t("common.sar")}</span>
            </span>
          </p>
        </div>
      ) : null}

      {/* A refusal about a row he has since taken off is still said. */}
      {refused && refused.index >= services.length ? (
        <p role="alert" className="text-xs text-destructive">
          {refused.message}
        </p>
      ) : null}
    </FormSection>
  );
}
