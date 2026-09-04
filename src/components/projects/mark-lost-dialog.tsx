"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { markProjectLostAction } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";

/**
 * "Mark lost (reason)" — SPEC §3. Lost is the rep's judgement (S20): it closes
 * the project and takes it off the active list, and a rejected quotation is
 * never the same thing (D11), which is why the dialog says so out loud.
 *
 * The reason is required and picked from a list, because a free-text field
 * produces nine spellings of "price" and answers nobody's question a year
 * later. "Other" is the only one that takes a written detail, and then it is
 * required — that written line is how the list grows.
 */

/** FACET's nine, in the order a rep meets them. `other` stays last (SPEC §3). */
export const LOSS_REASON_CODES = [
  "price",
  "competitor",
  "colour",
  "stock",
  "leadTime",
  "specification",
  "cancelled",
  "quiet",
  "other",
] as const;

export type LossReasonCode = (typeof LOSS_REASON_CODES)[number];

export function isLossReasonCode(value: string): value is LossReasonCode {
  return (LOSS_REASON_CODES as readonly string[]).includes(value);
}

export function MarkLostDialog({
  projectId,
  trigger,
}: {
  projectId: string;
  trigger?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; detail?: string }>({});
  const [pending, startTransition] = useTransition();

  const needsDetail = reason === "other";

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setReason("");
      setDetail("");
      setErrors({});
    }
  }

  function submit() {
    const trimmed = detail.trim();
    const found: { reason?: string; detail?: string } = {};
    if (!reason) found.reason = t("projects.lossReasonRequired");
    if (reason === "other" && !trimmed) found.detail = t("projects.lossDetailRequired");
    setErrors(found);
    if (found.reason || found.detail) return;

    startTransition(async () => {
      // One text column holds the answer (`projects.lost_reason`): the code for
      // the nine, the rep's own words for "Other". Both read back correctly —
      // a known code is translated, anything else is shown verbatim.
      const outcome = await markProjectLostAction(projectId, needsDetail ? trimmed : reason);
      if (!outcome.ok) {
        setErrors({ reason: outcome.fieldErrors?.reason });
        toast.error(outcome.error);
        return;
      }
      toast.success(t("projects.markedLost"));
      onOpenChange(false);
      // The drawer stays open and re-renders as closed-with-its-reason; the
      // list behind it drops the row, because lost leaves the active list.
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="destructive">{t("common.markLost")}</Button>}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.markLostTitle")}</DialogTitle>
          <DialogDescription>{t("projects.markLostDescription")}</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={errors.reason ? true : undefined}>
            <FieldLabel htmlFor="loss-reason">{t("projects.lossReasonLabel")}</FieldLabel>
            <Select
              value={reason || undefined}
              onValueChange={(next) => {
                setReason(next);
                setErrors((prev) => ({ ...prev, reason: undefined }));
              }}
            >
              <SelectTrigger id="loss-reason" className="w-full" aria-invalid={!!errors.reason}>
                <SelectValue placeholder={t("projects.lossReasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {LOSS_REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`projects.lossReason.${code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{errors.reason}</FieldError>
          </Field>

          {needsDetail ? (
            <Field data-invalid={errors.detail ? true : undefined}>
              <FieldLabel htmlFor="loss-detail">{t("projects.lossDetailLabel")}</FieldLabel>
              <Textarea
                id="loss-detail"
                rows={3}
                value={detail}
                aria-invalid={!!errors.detail}
                onChange={(event) => {
                  setDetail(event.target.value);
                  setErrors((prev) => ({ ...prev, detail: undefined }));
                }}
              />
              <FieldDescription>{t("projects.lossDetailRequired")}</FieldDescription>
              <FieldError>{errors.detail}</FieldError>
            </Field>
          ) : null}
        </FieldGroup>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={submit} disabled={pending}>
            {pending ? t("common.saving") : t("common.markLost")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
