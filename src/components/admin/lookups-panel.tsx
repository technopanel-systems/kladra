"use client";

import { EyeOff, Plus, Undo2 } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveLookupAction, setLookupActiveAction } from "@/actions/admin";
import { sendForm } from "@/components/admin/send-form";
import { RowMenu } from "@/components/ui-ext/row-menu";
import { useOpener } from "@/components/ui-ext/use-opener";
import { useRowFlash } from "@/components/ui-ext/use-row-flash";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
import { Empty } from "@/components/ui-ext/empty";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { FilterChip } from "@/components/ui-ext/filter-chip";
import { FilterRow } from "@/components/ui-ext/filter-row";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import {
  LOOKUP_FIELDS,
  LOOKUP_KINDS,
  type LookupKind,
  type LookupRow,
} from "@/lib/lookup-kinds";
import { cn } from "@/lib/utils";

/**
 * The reference lists an admin edits (SPEC §3, D1, D3, D21).
 *
 * One list at a time, chosen by a chip row, with the choice in the URL so a
 * refresh or a shared link lands on the same list.
 *
 * A row is never deleted, only taken out of use: the companies already on a
 * category have to keep reading correctly, and a row that vanishes takes their
 * history with it. Out-of-use rows stay on this screen, marked by a word, so
 * they can be put back.
 *
 * Edit is the row's action in plain sight; "Take out of use" is in the row's
 * menu, apart and in the tint, the same shape as the users screen (P13-G6,
 * S12.9). Side by side at one weight, the act that takes a category out of
 * every rep's dropdown sat one slip away from renaming it.
 *
 * The boxes differ by list because the lists do — a supplier has a code and a
 * full name, a thickness is a number — and which boxes a list has is decided in
 * src/lib/lookup-kinds.ts, not here and never by a form.
 */
export function LookupsPanel({
  title,
  kind,
  rows,
}: {
  title: string;
  kind: LookupKind;
  rows: LookupRow[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { flash, flashOf } = useRowFlash();

  // A value that needs its unit gets it once, here, so the row, the two
  // dialogs and the toast that name it back cannot say the thickness differently.
  const unitKey = LOOKUP_FIELDS[kind].find((field) => field.unitKey)?.unitKey;
  const named = (label: string) => (unitKey ? `${label} ${t(unitKey)}` : label);

  const [subject, setSubject] = useState<LookupRow | null>(null);
  const [act, setAct] = useState<"edit" | "active" | null>(null);
  const remember = useOpener(act !== null);
  const choose = (row: LookupRow, next: "edit" | "active") => (opener: HTMLElement | null) => {
    remember(opener);
    setSubject(row);
    setAct(next);
  };
  const closeTo = (open: boolean) => {
    if (!open) setAct(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <RowDialog
          kind={kind}
          named={named}
          trigger={
            <Button variant="brand">
              <Plus aria-hidden="true" />
              {t("admin.addRow")}
            </Button>
          }
          onSaved={(first) => {
            flash([`new:${first}`]);
            refresh();
          }}
        />
      </div>

      <FilterRow>
        {LOOKUP_KINDS.map((value) => (
          <FilterChip
            key={value}
            href={`/admin/lookups?list=${value}`}
            active={value === kind}
          >
            {t(`admin.lookup.${value}`)}
          </FilterChip>
        ))}
      </FilterRow>

      {/* A list with nothing on it says so, and says where the first row comes
          from — the Add at the top, not a second one here (DESIGN §1b, D31). */}
      {rows.length === 0 ? (
        <Empty>{t("admin.emptyLookups")}</Empty>
      ) : (
        <ul className="card-face flex flex-col">
          {rows.map((row) => {
            const byId = flashOf(String(row.id));
            const marked = byId.className ? byId : flashOf(`new:${row.values[0]}`);
            return (
              <li
                key={row.id}
                onAnimationEnd={marked.onAnimationEnd}
                className={cn(
                  "flex items-center gap-3 border-b border-line px-3 py-1 last:border-0 md:px-4 md:py-2",
                  marked.className,
                )}
              >
                {/* The name and its words wrap together, and only they give
                    way: the two controls keep their size at the end. */}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-2 md:py-0">
                  <span
                    data-slot="lookup-name"
                    className={cn("font-medium", !row.active && "text-muted-foreground")}
                  >
                    {named(row.label)}
                  </span>
                  {row.active ? null : <span data-slot="attribute" className="text-xs text-muted-foreground">{t("admin.hidden")}</span>}
                  {/* Why this row is missing from a rep's list (SPEC §3). Said on
                      the screen that owns the row, because the admin may rename it
                      in either language and nothing else here would tell him the
                      rename does not change what it does. */}
                  {row.restricted ? (
                    <span data-slot="attribute" className="text-xs text-muted-foreground">{t("admin.forManagement")}</span>
                  ) : null}
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={(event) => choose(row, "edit")(event.currentTarget)}
                  >
                    {t("common.edit")}
                  </Button>
                  <RowMenu
                    label={t("common.moreFor", { name: named(row.label) })}
                    items={[]}
                    end={
                      row.active
                        ? {
                            label: t("admin.hide"),
                            icon: EyeOff,
                            destructive: true,
                            onSelect: choose(row, "active"),
                          }
                        : { label: t("admin.show"), icon: Undo2, onSelect: choose(row, "active") }
                    }
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {subject ? (
        <>
          <RowDialog
            kind={kind}
            row={subject}
            named={named}
            open={act === "edit"}
            onOpenChange={closeTo}
            onSaved={() => {
              flash([String(subject.id)]);
              refresh();
            }}
          />
          <ConfirmDialog
            open={act === "active"}
            onOpenChange={closeTo}
            destructive={subject.active}
            title={
              subject.active
                ? t("admin.hideTitle", { name: named(subject.label) })
                : t("admin.showTitle", { name: named(subject.label) })
            }
            description={subject.active ? t("admin.hideHint") : t("admin.showHint")}
            confirmLabel={subject.active ? t("admin.hide") : t("admin.show")}
            successMessage={
              subject.active
                ? t("admin.rowHidden", { name: named(subject.label) })
                : t("admin.rowShown", { name: named(subject.label) })
            }
            onConfirm={() =>
              sendForm(setLookupActiveAction, {
                kind,
                id: String(subject.id),
                active: String(!subject.active),
              })
            }
            onDone={() => {
              flash([String(subject.id)]);
              refresh();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/** Add opens from its own button in the heading; Edit by state from a row. */
function RowDialog({
  kind,
  row,
  named,
  trigger,
  open: held,
  onOpenChange,
  onSaved,
}: {
  kind: LookupKind;
  row?: LookupRow;
  named: (label: string) => string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The first value as typed, so a new row can find itself and flash. */
  onSaved: (first: string) => void;
}) {
  const t = useTranslations();
  const [own, setOwn] = useState(false);
  const open = held ?? own;
  const setOpen = (next: boolean) => {
    if (held === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={row ? t("admin.editRow") : t("admin.addRow")}
      description={t(`admin.lookup.${kind}`)}
      trigger={trigger}
    >
      <RowForm
        key={row?.id ?? "new"}
        kind={kind}
        row={row}
        named={named}
        onClose={() => setOpen(false)}
        onSaved={onSaved}
      />
    </ResponsiveDialog>
  );
}

function RowForm({
  kind,
  row,
  named,
  onClose,
  onSaved,
}: {
  kind: LookupKind;
  row?: LookupRow;
  named: (label: string) => string;
  onClose: () => void;
  onSaved: (first: string) => void;
}) {
  const t = useTranslations();
  const fields = LOOKUP_FIELDS[kind];
  const [values, setValues] = useState<string[]>(() =>
    fields.map((_, index) => row?.values[index] ?? ""),
  );

  const { submit, pending, error, fieldErrors, answer } = useSubmitAction(
    saveLookupAction,
    () => {
      const typed = values.map((value) => value.trim());
      // Named the way the row reads it: its values on one line, and the unit.
      toast.success(t("admin.rowSaved", { name: named(typed.filter(Boolean).join(" · ")) }));
      onClose();
      onSaved(typed[0] ?? "");
    },
  );

  // Which box is the whole question here: a category is one row in two
  // languages, and "Required" at the bottom does not say which language.
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(form, answer);

  return (
    <form ref={form} action={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="kind" value={kind} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <FormBody>
        {fields.map((spec, index) => {
          // The action keys its answers by the field's own name, so a box and
          // its message need no second list to stay in step.
          const refused = fieldErrors[`f_${spec.key}`];
          return (
            <div key={spec.key} className="flex flex-col gap-2">
              <Label htmlFor={`lookup-${spec.key}`}>{t(spec.labelKey)}</Label>
              <Input
                id={`lookup-${spec.key}`}
                name={`f_${spec.key}`}
                dir={spec.key === "ar" ? undefined : "auto"}
                inputMode={spec.numeric ? "decimal" : undefined}
                className={spec.numeric ? "num" : undefined}
                value={values[index]}
                onChange={(event) =>
                  setValues((current) =>
                    current.map((value, i) => (i === index ? event.target.value : value)),
                  )
                }
                disabled={pending}
                aria-invalid={refused ? true : undefined}
                aria-describedby={refused ? `lookup-${spec.key}-error` : undefined}
              />
              {refused ? (
                <p
                  id={`lookup-${spec.key}-error`}
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {refused}
                </p>
              ) : null}
            </div>
          );
        })}
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onClose} />
    </form>
  );
}
