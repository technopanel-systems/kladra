"use client";

import { Plus } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveLookupAction, setLookupActiveAction } from "@/actions/admin";
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import {
  LOOKUP_FIELDS,
  LOOKUP_KINDS,
  type LookupKind,
  type LookupRow,
} from "@/lib/lookup-kinds";
import type { ActionResult } from "@/lib/types";
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
 * The boxes differ by list because the lists do — a supplier has a code and a
 * full name, a thickness is a number — and which boxes a list has is decided in
 * src/lib/admin.ts, not here and never by a form.
 */
export function LookupsPanel({
  kind,
  rows,
}: {
  kind: LookupKind;
  rows: LookupRow[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {LOOKUP_KINDS.map((value) => (
          <Button
            key={value}
            asChild
            variant={value === kind ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
          >
            <Link
              href={`/admin/lookups?list=${value}`}
              aria-current={value === kind ? "true" : undefined}
            >
              {t(`admin.lookup.${value}`)}
            </Link>
          </Button>
        ))}
      </div>

      <div className="flex">
        <RowDialog
          kind={kind}
          trigger={
            <Button className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
              <Plus aria-hidden="true" />
              {t("admin.addRow")}
            </Button>
          }
        />
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn("card-face flex flex-wrap items-center gap-3 p-3", !row.active && "opacity-70")}
          >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="font-medium">{row.label}</span>
              {row.active ? null : <Badge variant="outline">{t("admin.hidden")}</Badge>}
            </span>

            <RowDialog
              kind={kind}
              row={row}
              trigger={
                <Button variant="ghost" size="sm">
                  {t("common.edit")}
                </Button>
              }
            />

            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  {row.active ? t("admin.hide") : t("admin.show")}
                </Button>
              }
              title={
                row.active
                  ? t("admin.hideTitle", { name: row.label })
                  : t("admin.showTitle", { name: row.label })
              }
              description={row.active ? t("admin.hideHint") : t("admin.showHint")}
              confirmLabel={row.active ? t("admin.hide") : t("admin.show")}
              successMessage={t("admin.rowSaved")}
              onConfirm={() =>
                send(setLookupActiveAction, {
                  kind,
                  id: String(row.id),
                  active: String(!row.active),
                })
              }
              onDone={refresh}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function send(
  action: (
    prev: ActionResult<undefined> | null,
    form: FormData,
  ) => Promise<ActionResult<undefined>>,
  values: Record<string, string>,
): Promise<ActionResult<unknown>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return action(null, form);
}

function RowDialog({
  kind,
  row,
  trigger,
}: {
  kind: LookupKind;
  row?: LookupRow;
  trigger: ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={row ? t("admin.editRow") : t("admin.addRow")}
      description={t(`admin.lookup.${kind}`)}
      trigger={trigger}
    >
      <RowForm kind={kind} row={row} onClose={() => setOpen(false)} />
    </ResponsiveDialog>
  );
}

function RowForm({
  kind,
  row,
  onClose,
}: {
  kind: LookupKind;
  row?: LookupRow;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const fields = LOOKUP_FIELDS[kind];
  const [values, setValues] = useState<string[]>(() =>
    fields.map((_, index) => row?.values[index] ?? ""),
  );

  const { submit, pending, error } = useSubmitAction(saveLookupAction, () => {
    toast.success(t("admin.rowSaved"));
    onClose();
    router.refresh();
  });

  return (
    <form action={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="kind" value={kind} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <FormBody>
        {fields.map((spec, index) => (
          <div key={spec.key} className="flex flex-col gap-1.5">
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
            />
          </div>
        ))}
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onClose} />
    </form>
  );
}
