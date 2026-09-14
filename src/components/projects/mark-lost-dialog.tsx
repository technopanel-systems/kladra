"use client";

import { LOSS_REASON_CODES } from "@/lib/loss-reason";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { markProjectLostAction } from "@/actions/projects";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { useFlashProject } from "@/components/projects/project-flash";
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
 * the project, and a rejected quotation is never the same thing (D11), which is
 * why the dialog says so out loud.
 *
 * The reason is required and picked from a list, because a free-text field
 * produces nine spellings of "price" and answers nobody's question a year
 * later. "Other" is the only one that takes a written detail, and then it is
 * required — that written line is how the list grows.
 *
 * Opened from the drawer's menu, last and in the tint (P13-G6): the act that
 * ends a job does not stand in the row beside the one a rep presses every day.
 * The drawer hosts it and gives focus back to the menu's button. A blank reason
 * is refused at the field with the caret put there; a refusal that is not about
 * a field — the server out of reach — is written in the footer, and the choice
 * stays as it was.
 */

export function MarkLostDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const flash = useFlashProject();
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; detail?: string }>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [answer, setAnswer] = useState<object | null>(null);
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, answer);

  const needsDetail = reason === "other";

  function change(next: boolean) {
    if (pending) return;
    onOpenChange(next);
    if (!next) {
      setReason("");
      setDetail("");
      setErrors({});
      setRefusal(null);
    }
  }

  function submit() {
    const trimmed = detail.trim();
    const found: { reason?: string; detail?: string } = {};
    if (!reason) found.reason = t("projects.lossReasonRequired");
    if (reason === "other" && !trimmed) found.detail = t("projects.lossDetailRequired");
    setErrors(found);
    setRefusal(null);
    if (found.reason || found.detail) {
      setAnswer({});
      return;
    }

    startTransition(async () => {
      // One text column holds the answer (`projects.lost_reason`): the code for
      // the nine, the rep's own words for "Other". Both read back correctly —
      // a known code is translated, anything else is shown verbatim.
      const outcome = await guarded(markProjectLostAction)(projectId, needsDetail ? trimmed : reason);
      if (!outcome.ok) {
        const atField = outcome.fieldErrors?.reason;
        setErrors({ reason: atField });
        setRefusal(atField ? null : outcome.error);
        setAnswer({});
        return;
      }
      toast.success(t("projects.markedLost", { name: projectName }));
      onOpenChange(false);
      setReason("");
      setDetail("");
      flash(projectId);
      // The drawer stays open and re-renders as lost, with its reason; the row
      // behind it goes to the foot of the list, where lost projects sit.
      router.refresh();
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={change}
      title={t("projects.markLostTitle")}
      context={projectName}
      description={t("projects.markLostDescription")}
    >
      {/* A form, so the written detail can be confirmed from the keyboard
          (D114): Enter stays a new line in the box, Ctrl/Cmd+Enter marks it. */}
      <form
        ref={formRef}
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
                  dir="auto"
                  value={detail}
                  readOnly={pending}
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
                {/* The same sentence either way: said once, as a hint until it
                    is the refusal. */}
                {errors.detail ? (
                  <FieldError id="loss-detail-error">{errors.detail}</FieldError>
                ) : (
                  <FieldDescription>{t("projects.lossDetailRequired")}</FieldDescription>
                )}
              </Field>
            ) : null}
          </FieldGroup>
        </FormBody>
        <FormFooter
          error={refusal}
          pending={pending}
          onCancel={() => change(false)}
          confirmLabel={t("common.markLost")}
          confirmVariant="destructive"
        />
      </form>
    </ResponsiveDialog>
  );
}
