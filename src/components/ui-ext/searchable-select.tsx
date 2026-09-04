"use client";

import { ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The searchable dropdown (DESIGN §2: over ~8 entries, searchable, common
 * values pinned, the likeliest preselected). Countries are 249 rows and Saudi
 * cities 171; nobody scrolls those.
 *
 * Two things it does that a plain Command does not:
 *
 * - **Pinned first, then a rule, then the rest.** The six Gulf countries and the
 *   six big Saudi cities sit above the line in the founder's order (SPEC §3);
 *   everything else follows alphabetically. The line disappears when a search
 *   empties one side.
 * - **Search in either script.** cmdk's own filter is off: matching folds
 *   Arabic orthography (أ إ آ → ا, ة → ه, ى → ي, diacritics and tatweel away) and
 *   also reads `keywords`, which carries the other-script spelling — so "الرياض"
 *   finds Riyadh in the English list and "Riyadh" finds it in the Arabic one
 *   (SPEC D7).
 *
 * `allowCustom` is for the one list a rep is allowed to type over: contact
 * position, seeded as a list but stored as text (SPEC D21).
 */

export type SelectOption = {
  /** The row id as a string — or, where the value IS the text, the text. */
  value: string;
  label: string;
  /** Shown above the rule, in the order given. */
  pinned?: boolean;
  /** The other-script spelling, so search works in either language. */
  keywords?: string;
};

/** Harakat (U+064B–U+0652), the dagger alef and the tatweel stretch mark. */
const ARABIC_NOISE = /[\u064B-\u0652\u0670\u0640]/g;

/**
 * One spelling of a word, for comparison only. Arabic is written with several
 * shapes of the same letter and readers type whichever is on the keyboard; a
 * rep looking for "الأحساء" must not have to guess which hamza we seeded.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(ARABIC_NOISE, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  id,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  invalid,
  allowCustom = false,
  className,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  invalid?: boolean;
  /** Offer whatever the rep typed as a value of its own (SPEC D21). */
  allowCustom?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((option) => option.value === value) ?? null;
  // A typed-over value is not in the list; it is still what the field holds.
  const shown = selected?.label ?? (allowCustom && value ? value : null);

  const { pinned, rest, custom } = useMemo(() => {
    const needle = fold(search);
    const matched = needle
      ? options.filter(
          (option) =>
            fold(option.label).includes(needle) ||
            (option.keywords ? fold(option.keywords).includes(needle) : false),
        )
      : options;
    const typed = search.trim();
    const exact = typed !== "" && options.some((option) => fold(option.label) === needle);
    return {
      pinned: matched.filter((option) => option.pinned),
      rest: matched.filter((option) => !option.pinned),
      custom: allowCustom && typed !== "" && !exact ? typed : null,
    };
  }, [options, search, allowCustom]);

  function choose(next: string) {
    onChange(next);
    setSearch("");
    setOpen(false);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between gap-2 px-2.5 font-normal",
            shown === null && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-start">{shown ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            {pinned.length === 0 && rest.length === 0 && custom === null ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : null}

            {pinned.length > 0 ? (
              <CommandGroup>
                {pinned.map((option) => (
                  <Row key={option.value} option={option} value={value} onChoose={choose} />
                ))}
              </CommandGroup>
            ) : null}

            {pinned.length > 0 && rest.length > 0 ? <CommandSeparator /> : null}

            {rest.length > 0 ? (
              <CommandGroup>
                {rest.map((option) => (
                  <Row key={option.value} option={option} value={value} onChoose={choose} />
                ))}
              </CommandGroup>
            ) : null}

            {custom !== null ? (
              <CommandGroup>
                <CommandItem value="__custom__" onSelect={() => choose(custom)}>
                  <span className="truncate">{t("forms.useTyped", { text: custom })}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** `data-checked` is what the kit's CommandItem hangs its tick on. */
function Row({
  option,
  value,
  onChoose,
}: {
  option: SelectOption;
  value: string | null | undefined;
  onChoose: (value: string) => void;
}) {
  return (
    <CommandItem
      value={option.value}
      data-checked={option.value === value}
      onSelect={() => onChoose(option.value)}
    >
      <span className="truncate">{option.label}</span>
    </CommandItem>
  );
}
