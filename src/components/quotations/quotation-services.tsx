"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect, type SelectOption } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, serviceTotal } from "@/lib/money";
import type { DraftService } from "@/lib/quotation-draft";
import { cn } from "@/lib/utils";

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
 * The same two shapes as the lines, for the same reasons: a card per service on a
 * phone, a row of a table from `xl`, one DOM for both (quotation-lines.tsx).
 * Nothing is offered from a previous quotation (D163): a new request opens with
 * no services, and Add service opens a blank row, because a service's price is
 * the one figure it has and a price a screen fills in is a price nobody checks.
 */

/** Number, service, m², price, total, remove — from `xl`, header and rows alike. */
const SERVICE_GRID =
  "xl:grid xl:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,7.5rem)_2rem] xl:items-center xl:gap-x-2";

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

export function QuotationServices({
  choices,
  services,
  subtotal,
  onChange,
  disabled,
}: {
  /** The services the admin offers, in his order (quotationServiceChoicesAction). */
  choices: SelectOption[];
  services: ServiceDraft[];
  /** What they come to together — the same figure the totals block shows. */
  subtotal: number;
  onChange: (services: ServiceDraft[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const headingId = useId();

  function patch(key: string, change: Partial<ServiceDraft>) {
    onChange(services.map((service) => (service.key === key ? { ...service, ...change } : service)));
  }

  return (
    <section
      data-slot="quotation-services"
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-medium">
          {t("quotations.services")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("quotations.servicesHint")}</p>
      </div>

      {services.length > 0 ? (
        <div data-slot="quotation-service-rows" className="flex flex-col gap-3 xl:card-face xl:gap-0">
          <div
            aria-hidden="true"
            className={cn(
              "hidden border-b border-line bg-surface-2 px-3 py-2 text-xs text-muted-foreground",
              SERVICE_GRID,
            )}
          >
            <span />
            <span className="truncate">{t("quotations.service")}</span>
            <span className="truncate">{t("common.sqm")}</span>
            <span className="truncate">{t("common.pricePerSqm")}</span>
            <span className="truncate text-end">{t("quotations.serviceTotal")}</span>
            <span />
          </div>

          {services.map((service, index) => {
            const id = (fieldName: string) => `${service.key}-${fieldName}`;
            return (
              <div
                key={service.key}
                data-slot="quotation-service"
                className={cn(
                  "card-face flex flex-col gap-3 p-3",
                  "xl:overflow-visible xl:rounded-none xl:border-x-0 xl:border-t-0 xl:bg-transparent xl:px-3 xl:py-2 xl:shadow-none xl:last:border-b-0",
                  SERVICE_GRID,
                )}
              >
                <div className="flex items-center justify-between gap-2 xl:contents">
                  <h4 className="text-sm font-medium xl:text-xs xl:font-normal xl:text-muted-foreground">
                    <span className="xl:sr-only">
                      {t("quotations.serviceNumber", { number: index + 1 })}
                    </span>
                    <span aria-hidden="true" className="num hidden xl:inline">
                      {index + 1}
                    </span>
                  </h4>
                  {/* Any service may go, the last one too: a quotation with no
                      services is the ordinary one. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onChange(services.filter((row) => row.key !== service.key))}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive xl:order-last xl:size-8 xl:justify-self-end xl:px-0"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    <span className="xl:sr-only">{t("quotations.removeService")}</span>
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:contents">
                  <div className="col-span-2 flex min-w-0 flex-col gap-1.5 xl:col-auto">
                    <Label id={id("service-label")} className="xl:sr-only">
                      {t("quotations.service")}
                    </Label>
                    <SearchableSelect
                      aria-labelledby={id("service-label")}
                      value={service.serviceId}
                      onChange={(value) => patch(service.key, { serviceId: value })}
                      options={choices}
                      disabled={disabled}
                      placeholder={t("forms.choose")}
                      searchPlaceholder={t("forms.searchList")}
                      emptyText={t("forms.noMatch")}
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={id("sqm")} className="xl:sr-only">
                      {t("common.sqm")}
                    </Label>
                    <Input
                      id={id("sqm")}
                      required
                      disabled={disabled}
                      inputMode="decimal"
                      dir="ltr"
                      autoComplete="off"
                      className="num h-9 text-start"
                      value={service.sqm}
                      onChange={(event) => patch(service.key, { sqm: event.target.value })}
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={id("price")} className="xl:sr-only">
                      {t("common.pricePerSqm")}
                    </Label>
                    <Input
                      id={id("price")}
                      required
                      disabled={disabled}
                      inputMode="decimal"
                      dir="ltr"
                      autoComplete="off"
                      className="num h-9 text-start"
                      value={service.pricePerSqm}
                      onChange={(event) => patch(service.key, { pricePerSqm: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-baseline justify-end gap-x-2 border-t border-line pt-2 text-sm xl:contents">
                  <span
                    data-slot="service-total"
                    className="min-w-0 text-muted-foreground xl:truncate xl:text-end"
                  >
                    <span className="xl:sr-only">{t("quotations.serviceTotal")} </span>
                    <span dir="ltr" className="num font-medium text-foreground">
                      {formatMoney(serviceTotal(service))}
                    </span>
                    <span className="xl:sr-only"> {t("common.sar")}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...services, blankService()])}
        >
          <Plus aria-hidden="true" />
          {t("quotations.addService")}
        </Button>
        {services.length > 0 ? (
          <p data-slot="services-subtotal" className="text-sm text-muted-foreground">
            {t("quotations.servicesSubtotal")}{" "}
            <span dir="ltr" className="num font-medium text-foreground">
              {formatMoney(subtotal)}
            </span>{" "}
            {t("common.sar")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
