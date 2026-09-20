"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SearchableSelect, type SelectOption } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MOST_WAREHOUSES } from "@/lib/warehouse-list";

/**
 * Where the panels come out of (SPEC §3, P12-9, widened by P14).
 *
 * The founder, after a third round of use: "A quotation or a dispatch may name
 * more than one warehouse. Not per line — that would confuse the reps. The field
 * takes one warehouse normally and allows a second or a third in the rare case."
 *
 * So the field is the field it always was — one picker, opened on the likeliest
 * store — and under it a quiet "Add another store" that most reps will never
 * press. The rare case costs one press; the ordinary case costs nothing, which
 * is the way round the founder asked for. Three at the most, and the offer goes
 * away at the third rather than leaving a button that refuses (DESIGN §5: no
 * dead control).
 *
 * A store already named is not offered again on the row below it: two names for
 * one store is one store, here, in the action and in `setWarehouses`.
 *
 * One field crosses to the server, comma-separated, because FormData has no
 * shape for a list (src/lib/warehouse-list.ts).
 */
export function WarehouseField({
  id,
  options,
  value,
  onChange,
  disabled,
  error,
}: {
  /** What the ids of this form's label and error are built from: `quotation`, `dispatch`. */
  id: string;
  options: SelectOption[];
  /** The stores, first one first. One empty string is "he has not chosen yet". */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const t = useTranslations();
  const chosen = value.length > 0 ? value : [""];
  const errorId = `${id}-warehouse-error`;

  // What is left to offer on a row: everything, less the stores the other rows
  // already name.
  const othersOn = (index: number) =>
    options.filter(
      (option) => !chosen.some((store, at) => at !== index && store === option.value),
    );

  const put = (index: number, store: string) =>
    onChange(chosen.map((was, at) => (at === index ? store : was)));

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id={`${id}-warehouse-label`}>{t("common.warehouse")}</Label>
      {chosen.map((store, index) => (
        // The rows are the list itself and have no id of their own to key on;
        // removing one moves every store after it up, which is what the reader
        // sees happen.
        <div key={index} className="flex min-w-0 items-center gap-1.5">
          <SearchableSelect
            {...(index === 0
              ? { "aria-labelledby": `${id}-warehouse-label` }
              : { "aria-label": t("common.anotherWarehouse") })}
            options={othersOn(index)}
            value={store}
            onChange={(next) => put(index, next)}
            disabled={disabled}
            invalid={index === 0 && error ? true : undefined}
            aria-describedby={index === 0 && error ? errorId : undefined}
            placeholder={t("forms.choose")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("forms.noMatch")}
            className="min-w-0 flex-1"
          />
          {index > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onChange(chosen.filter((_, at) => at !== index))}
              aria-label={t("common.removeWarehouse")}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ))}

      {/* Offered only once the row above it has an answer: a second empty
          picker under an empty one is a form asking twice for nothing. */}
      {chosen.length < MOST_WAREHOUSES && chosen.at(-1) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...chosen, ""])}
          className="self-start text-muted-foreground"
        >
          <Plus aria-hidden="true" />
          {t("common.addWarehouse")}
        </Button>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {/* One value, the empty rows dropped: a rep who opened a second picker and
          left it alone named one store, not one and a blank. */}
      <input type="hidden" name="warehouseIds" value={chosen.filter(Boolean).join(",")} />
    </div>
  );
}
