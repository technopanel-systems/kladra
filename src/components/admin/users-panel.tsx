"use client";

import { Plus } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/actions/admin";
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { PromptDialog } from "@/components/ui-ext/prompt-dialog";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { AdminUser } from "@/lib/admin";
import type { ActionResult, Role } from "@/lib/types";

/**
 * The people who use Kladra (SPEC S7, §3).
 *
 * Nobody self-registers and nobody is deleted. An account that should stop
 * working is deactivated: it cannot sign in, its open sessions go, and every
 * company, quotation and log entry still names it — which is the whole point,
 * because history that points at a deleted person is history nobody can read.
 *
 * The role is what somebody may do, so it is the third column and not buried in
 * a dialog. Inactive accounts stay on the list, greyed by a word rather than by
 * a colour (DESIGN §4).
 */

const ROLES: Role[] = ["rep", "coordinator", "manager", "admin"];

export function UsersPanel({ users }: { users: AdminUser[] }) {
  const t = useTranslations();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex">
        <UserDialog
          mode="create"
          trigger={
            <Button className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
              <Plus aria-hidden="true" />
              {t("admin.addUser")}
            </Button>
          }
        />
      </div>

      <div className="card-face">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="p-3">{t("common.name")}</TableHead>
              <TableHead className="p-3">{t("common.email")}</TableHead>
              <TableHead className="p-3">{t("common.role")}</TableHead>
              <TableHead className="p-3">{t("common.companies")}</TableHead>
              <TableHead className="p-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="p-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{user.name}</span>
                    {user.active ? null : (
                      <Badge variant="outline">{t("admin.inactive")}</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="p-3 text-muted-foreground">
                  <span dir="ltr">{user.email}</span>
                </TableCell>
                <TableCell className="p-3">{t(`admin.role.${user.role}`)}</TableCell>
                <TableCell className="p-3 text-muted-foreground">
                  {t("admin.companiesOnFloor", { count: user.companies })}
                </TableCell>
                <TableCell className="p-3">
                  <span className="flex flex-wrap justify-end gap-1">
                    <UserDialog
                      mode="edit"
                      user={user}
                      trigger={
                        <Button variant="ghost" size="sm">
                          {t("common.edit")}
                        </Button>
                      }
                    />
                    <PromptDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          {t("admin.resetPassword")}
                        </Button>
                      }
                      title={t("admin.resetPasswordTitle", { name: user.name })}
                      description={t("admin.resetPasswordHint")}
                      label={t("admin.newPassword")}
                      confirmLabel={t("admin.resetPassword")}
                      successMessage={t("admin.passwordReset", { name: user.name })}
                      onConfirm={(password) =>
                        send(resetPasswordAction, { userId: user.id, password })
                      }
                      onDone={refresh}
                    />
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          {user.active ? t("admin.deactivate") : t("admin.activate")}
                        </Button>
                      }
                      title={
                        user.active
                          ? t("admin.deactivateTitle", { name: user.name })
                          : t("admin.activateTitle", { name: user.name })
                      }
                      description={
                        user.active ? t("admin.deactivateHint") : t("admin.activateHint")
                      }
                      confirmLabel={user.active ? t("admin.deactivate") : t("admin.activate")}
                      successMessage={
                        user.active
                          ? t("admin.deactivated", { name: user.name })
                          : t("admin.activated", { name: user.name })
                      }
                      onConfirm={() =>
                        send(setUserActiveAction, {
                          userId: user.id,
                          active: String(!user.active),
                        })
                      }
                      onDone={refresh}
                    />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Turns a plain object into the FormData every action takes. */
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

/** Add and Edit are the same four fields; only Add asks for a password. */
function UserDialog({
  mode,
  user,
  trigger,
}: {
  mode: "create" | "edit";
  user?: AdminUser;
  trigger: ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={mode === "create" ? t("admin.addUser") : t("admin.editUser")}
      description={t("admin.userHint")}
      trigger={trigger}
    >
      <UserForm mode={mode} user={user} onClose={() => setOpen(false)} />
    </ResponsiveDialog>
  );
}

function UserForm({
  mode,
  user,
  onClose,
}: {
  mode: "create" | "edit";
  user?: AdminUser;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(user?.role ?? "rep");

  const { submit, pending, error, fieldErrors, answer } = useSubmitAction(
    mode === "create" ? createUserAction : updateUserAction,
    () => {
      toast.success(
        mode === "create" ? t("admin.userAdded", { name }) : t("admin.userSaved"),
      );
      onClose();
      router.refresh();
    },
  );

  // This dialog is taller than a phone, so a message that only appears beside a
  // box is one the admin may never scroll to.
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(form, answer);

  const options = ROLES.map((value) => ({ value, label: t(`admin.role.${value}`) }));

  return (
    <form ref={form} action={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      {user ? <input type="hidden" name="userId" value={user.id} /> : null}
      <input type="hidden" name="role" value={role} />

      <FormBody>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-name">{t("common.name")}</Label>
          <Input
            id="user-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "user-name-error" : undefined}
          />
          {fieldErrors.name ? (
            <p id="user-name-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-email">{t("common.email")}</Label>
          <Input
            id="user-email"
            name="email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "user-email-error" : undefined}
          />
          {fieldErrors.email ? (
            <p id="user-email-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label id="user-role-label">{t("common.role")}</Label>
          <SearchableSelect
            aria-labelledby="user-role-label"
            options={options}
            value={role}
            onChange={setRole}
            disabled={pending}
            placeholder={t("forms.choose")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("forms.noMatch")}
          />
        </div>

        {mode === "create" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-password">{t("admin.newPassword")}</Label>
            {/* Visible on purpose: the admin types a first password and reads it
                out. A masked box he cannot check is how somebody gets told the
                wrong one and calls back an hour later. */}
            <Input
              id="user-password"
              name="password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "user-password-error" : undefined}
            />
            {fieldErrors.password ? (
              <p id="user-password-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>
        ) : null}
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onClose} />
    </form>
  );
}
