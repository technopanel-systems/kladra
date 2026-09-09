"use client";

import { LOSS_REASON_CODES } from "@/lib/loss-reason";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { markProjectLostAction } from "@/actions/projects";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { Button } from "@/components/ui/button";
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

export function MarkLostDialog({ projectId, trigger }: { projectId: string; trigger?: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; detail?: string }>({});
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();

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
      const outcome = await guarded(markProjectLostAction)(projectId, needsDetail ? trimmed : reason);
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
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger ?? <Button variant="destructive">{t("common.markLost")}</Button>}
      title={t("projects.markLostTitle")}
      description={t("projects.markLostDescription")}
    >
      {/* A form, so the written detail can be confirmed from the keyboard
          (D114): Enter stays a new line in the box, Ctrl/Cmd+Enter marks it. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) submit();
        }}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <FormBody>
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
                <SelectTrigger
                  id="loss-reason"
                  className="w-full"
                  aria-invalid={errors.reason ? true : undefined}
                  // The refusal is reachable from the control, not only
                  // announced when it appears (DESIGN §5).
                  aria-describedby={errors.reason ? "loss-reason-error" : undefined}
                >
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
              <FieldError id="loss-reason-error">{errors.reason}</FieldError>
            </Field>

            {needsDetail ? (
              <Field data-invalid={errors.detail ? true : undefined}>
                <FieldLabel htmlFor="loss-detail">{t("projects.lossDetailLabel")}</FieldLabel>
                <Textarea
                  id="loss-detail"
                  rows={3}
                  value={detail}
                  aria-invalid={errors.detail ? true : undefined}
                  aria-describedby={errors.detail ? "loss-detail-error" : undefined}
                  onChange={(event) => {
                    setDetail(event.target.value);
                    setErrors((prev) => ({ ...prev, detail: undefined }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      if (!pending) submit();
                    }
                  }}
                />
                <FieldDescription>{t("projects.lossDetailRequired")}</FieldDescription>
                <FieldError id="loss-detail-error">{errors.detail}</FieldError>
              </Field>
            ) : null}
          </FieldGroup>

        </FormBody>
        <FormFooter
          pending={pending}
          onCancel={() => onOpenChange(false)}
          confirmLabel={t("common.markLost")}
          confirmVariant="destructive"
        />
      </form>
    </ResponsiveDialog>
  );
}
