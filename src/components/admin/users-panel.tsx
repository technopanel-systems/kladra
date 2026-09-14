"use client";

import { KeyRound, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { useCallback, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/actions/admin";
import { startViewingAction } from "@/actions/view-as";
import { sendForm } from "@/components/admin/send-form";
import { RowMenu } from "@/components/ui-ext/row-menu";
import { useOpener } from "@/components/ui-ext/use-opener";
import { useRowFlash } from "@/components/ui-ext/use-row-flash";
import { useSubmitAction, useWireGuard } from "@/components/ui-ext/action-outcome";
import { Avatar } from "@/components/ui-ext/avatar";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { Empty } from "@/components/ui-ext/empty";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
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
import { personNameFrom } from "@/lib/person-name";
import { ROLES } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The people who use Kladra (SPEC S7, §3).
 *
 * Nobody self-registers and nobody is deleted. An account that should stop
 * working is deactivated: it cannot sign in, its open sessions go, and every
 * company, quotation and log entry still names it — which is the whole point,
 * because history that points at a deleted person is history nobody can read.
 *
 * A row is a person, so it starts with the person (DESIGN §1b: 24 round in a
 * row), and it carries ONE action in plain sight — View as, what the admin opens
 * this list to do (P8.8). Edit and Reset password are in the row's menu, and
 * Deactivate is last in it, apart and in the tint (P13-G6, S12.9): four
 * plain-text actions at one weight made the users screen read as a table of
 * accounts with buttons on it, seventy pixels a row, with the act that locks
 * somebody out one slip away from the one pressed most.
 *
 * Below `md` the same rows, one card, the menu and View as on a line of their
 * own at the thumb (D130) — nothing is reached by hover at either width.
 *
 * The dialogs the menu opens are mounted once, here, and told whose row asked
 * (DESIGN §5: a list mounts one dialog and draws its rows as data).
 */

type Act = "edit" | "password" | "active";

export function UsersPanel({
  title,
  users,
  meId,
}: {
  title: string;
  users: AdminUser[];
  meId: string;
}) {
  const t = useTranslations();
  // This list is a screen like any other: it names people in the reader's
  // script. The FORM below keeps both names raw, because it edits the pair.
  const locale = useLocale();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { flash, flashOf } = useRowFlash();

  // Whose row asked, kept while the dialog closes so its words do not blank
  // during the exit; and which dialog is open, if any.
  const [subject, setSubject] = useState<AdminUser | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const remember = useOpener(act !== null);
  const choose = (user: AdminUser, next: Act) => (opener: HTMLElement | null) => {
    remember(opener);
    setSubject(user);
    setAct(next);
  };
  const closeTo = (open: boolean) => {
    if (!open) setAct(null);
  };

  /** A row marks itself by id after an edit, by email after an add. */
  const rowFlash = (user: AdminUser) => {
    const byId = flashOf(user.id);
    return byId.className ? byId : flashOf(user.email);
  };

  const menuFor = (user: AdminUser) => {
    const name = personNameFrom(user, locale);
    return (
      <RowMenu
        label={t("admin.moreFor", { name })}
        items={[
          { label: t("common.edit"), icon: Pencil, onSelect: choose(user, "edit") },
          { label: t("admin.resetPassword"), icon: KeyRound, onSelect: choose(user, "password") },
        ]}
        end={
          user.active
            ? {
                label: t("admin.deactivate"),
                icon: UserX,
                destructive: true,
                onSelect: choose(user, "active"),
                // The action refuses the admin's own account; the menu says so
                // first, where he would have pressed (D119).
                refused: user.id === meId ? t("admin.cannotDeactivateSelf") : undefined,
              }
            : { label: t("admin.activate"), icon: UserCheck, onSelect: choose(user, "active") }
        }
      />
    );
  };

  const subjectName = subject ? personNameFrom(subject, locale) : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <UserDialog
          mode="create"
          trigger={
            <Button variant="brand">
              <Plus aria-hidden="true" />
              {t("admin.addUser")}
            </Button>
          }
          onSaved={(email) => {
            flash([email]);
            refresh();
          }}
        />
      </div>

      {users.length === 0 ? (
        // Not a state this screen reaches — the admin reading it is on the
        // list — but a list never draws a blank (DESIGN §1b).
        <Empty>{t("shell.emptyUsers")}</Empty>
      ) : (
        <>
          <ul className="card-face flex flex-col md:hidden">
            {users.map((user) => {
              const name = personNameFrom(user, locale);
              const marked = rowFlash(user);
              return (
                <li
                  key={user.id}
                  onAnimationEnd={marked.onAnimationEnd}
                  className={cn(
                    "flex items-start gap-3 border-b border-line px-3 pt-3 pb-1 last:border-0",
                    marked.className,
                  )}
                >
                  <Avatar id={user.id} name={name} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{name}</span>
                      {user.active ? null : <Badge variant="outline">{t("admin.inactive")}</Badge>}
                    </span>
                    {/* The address is the one thing here that must never be
                        cut: it is what the person signs in with. */}
                    <span dir="ltr" className="text-start text-xs break-all text-muted-foreground">
                      {user.email}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(`common.${user.role}`)} · {t("admin.companiesOnFloor", { count: user.companies })}
                    </span>
                    <span className="flex items-center gap-2">
                      <ViewAs user={user} meId={meId} />
                      <span className="ms-auto">{menuFor(user)}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="card-face hidden md:block">
            <Table label={title}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3">{t("common.name")}</TableHead>
                  <TableHead className="px-3">{t("common.email")}</TableHead>
                  <TableHead className="px-3">{t("common.role")}</TableHead>
                  <TableHead className="px-3 text-end">{t("common.companies")}</TableHead>
                  <TableHead className="px-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const name = personNameFrom(user, locale);
                  const marked = rowFlash(user);
                  return (
                    <TableRow
                      key={user.id}
                      onAnimationEnd={marked.onAnimationEnd}
                      className={marked.className}
                    >
                      <TableCell className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <Avatar id={user.id} name={name} size="sm" />
                          <span className="font-medium">{name}</span>
                          {user.active ? null : (
                            <Badge variant="outline">{t("admin.inactive")}</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-muted-foreground">
                        <span dir="ltr">{user.email}</span>
                      </TableCell>
                      <TableCell className="px-3 py-2">{t(`common.${user.role}`)}</TableCell>
                      {/* A count, so it ends its column in the figure face; the
                          heading says what it counts. */}
                      <TableCell className="px-3 py-2 text-end">
                        <span dir="ltr" className="num">
                          {user.companies}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <span className="flex items-center justify-end gap-2">
                          <ViewAs user={user} meId={meId} />
                          {menuFor(user)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {subject ? (
        <>
          <UserDialog
            mode="edit"
            user={subject}
            open={act === "edit"}
            onOpenChange={closeTo}
            onSaved={() => {
              flash([subject.id]);
              refresh();
            }}
          />
          <ResetPasswordDialog
            user={subject}
            name={subjectName}
            open={act === "password"}
            onOpenChange={closeTo}
          />
          <ConfirmDialog
            open={act === "active"}
            onOpenChange={closeTo}
            destructive={subject.active}
            title={
              subject.active
                ? t("admin.deactivateTitle", { name: subjectName })
                : t("admin.activateTitle", { name: subjectName })
            }
            description={subject.active ? t("admin.deactivateHint") : t("admin.activateHint")}
            confirmLabel={subject.active ? t("admin.deactivate") : t("admin.activate")}
            successMessage={
              subject.active
                ? t("admin.deactivated", { name: subjectName })
                : t("admin.activated", { name: subjectName })
            }
            onConfirm={() =>
              sendForm(setUserActiveAction, {
                userId: subject.id,
                active: String(!subject.active),
              })
            }
            onDone={() => {
              flash([subject.id]);
              refresh();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Looking at the app as somebody else, from the screen where the admin is
 * already looking at the list of people (P8.8) — the row's one visible action.
 * Not offered on his own row — that is not viewing, it is just working — and
 * not on a deactivated account, because it would be a way round deactivation.
 */
function ViewAs({ user, meId }: { user: AdminUser; meId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  if (!user.active || user.id === meId) return null;
  const name = personNameFrom(user, locale);

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="xs">
          {t("viewAs.start")}
        </Button>
      }
      title={t("viewAs.title", { name })}
      description={t("viewAs.hint")}
      confirmLabel={t("viewAs.start")}
      successMessage={t("viewAs.started", { name })}
      onConfirm={() => sendForm(startViewingAction, { userId: user.id })}
      onDone={() => router.refresh()}
    />
  );
}

/**
 * A new password, typed by the admin and read out (S7). Opened from the row's
 * menu, so by state rather than by a trigger of its own (see `ConfirmDialog` with `open`).
 * A refusal about the password is said under the password; one about the whole
 * attempt — the wire, an account that is gone — in the footer.
 */
function ResetPasswordDialog({
  user,
  name,
  open,
  onOpenChange,
}: {
  user: AdminUser;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const guarded = useWireGuard();
  const [value, setValue] = useState("");
  const [atField, setAtField] = useState<string | null>(null);
  const [atForm, setAtForm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Forgotten on the next open — adjusted while rendering, the way React asks
  // for state that follows a prop.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue("");
      setAtField(null);
      setAtForm(null);
    }
  }

  function change(next: boolean) {
    if (!pending) onOpenChange(next);
  }

  function confirm() {
    startTransition(async () => {
      // Guarded: no answer at all is a refusal too, not the error card (D132).
      const result = await guarded(() =>
        sendForm(resetPasswordAction, { userId: user.id, password: value.trim() }),
      )();
      if (!result.ok) {
        const field = result.fieldErrors ? Object.values(result.fieldErrors)[0] : null;
        setAtField(field ?? null);
        setAtForm(field ? null : result.error);
        return;
      }
      toast.success(t("admin.passwordReset", { name }));
      onOpenChange(false);
    });
  }

  const ids = useId();
  const fieldId = `${ids}-password`;
  const errorId = `${ids}-error`;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={change}
      title={t("admin.resetPasswordTitle", { name })}
      description={t("admin.resetPasswordHint")}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) confirm();
        }}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <FormBody>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{t("admin.newPassword")}</Label>
            {/* Visible on purpose: the admin reads it out, and a masked box he
                cannot check is how somebody is told the wrong one. Read-only
                while it saves, so the caret stays where a refusal is fixed. */}
            <Input
              id={fieldId}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              readOnly={pending}
              value={value}
              aria-invalid={atField ? true : undefined}
              aria-describedby={atField ? errorId : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
            {atField ? (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {atField}
              </p>
            ) : null}
          </div>
        </FormBody>
        <FormFooter
          error={atForm}
          pending={pending}
          onCancel={() => change(false)}
          confirmLabel={t("admin.resetPassword")}
        />
      </form>
    </ResponsiveDialog>
  );
}

/**
 * Add and Edit are the same four fields; only Add asks for a password. Add opens
 * from its own button in the heading; Edit is opened by state from a row's menu.
 */
function UserDialog({
  mode,
  user,
  trigger,
  open: held,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  user?: AdminUser;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The saved account's email, so its row can take the arrived flash. */
  onSaved: (email: string) => void;
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
      title={mode === "create" ? t("admin.addUser") : t("admin.editUser")}
      description={t("admin.userHint")}
      trigger={trigger}
    >
      <UserForm
        key={user?.id ?? "new"}
        mode={mode}
        user={user}
        onClose={() => setOpen(false)}
        onSaved={onSaved}
      />
    </ResponsiveDialog>
  );
}

function UserForm({
  mode,
  user,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  user?: AdminUser;
  onClose: () => void;
  onSaved: (email: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [name, setName] = useState(user?.name ?? "");
  const [nameAr, setNameAr] = useState(user?.nameAr ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(user?.role ?? "rep");

  const { submit, pending, error, fieldErrors, answer } = useSubmitAction(
    mode === "create" ? createUserAction : updateUserAction,
    () => {
      // The person by name, in the reader's script, whichever dialog saved it.
      const said = personNameFrom({ name: name.trim(), nameAr }, locale);
      toast.success(
        mode === "create" ? t("admin.userAdded", { name: said }) : t("admin.userSaved", { name: said }),
      );
      onClose();
      onSaved(email.trim().toLowerCase());
    },
  );

  // This dialog is taller than a phone, so a message that only appears beside a
  // box is one the admin may never scroll to.
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(form, answer);

  const options = ROLES.map((value) => ({ value, label: t(`common.${value}`) }));

  return (
    <form ref={form} action={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      {user ? <input type="hidden" name="userId" value={user.id} /> : null}
      <input type="hidden" name="role" value={role} />

      <FormBody>
        <div className="flex flex-col gap-2">
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

        {/* Beside the Latin one, not instead of it. Empty is allowed and is
            what an account added in a hurry has: the Latin name then shows on
            every screen in both languages (D68). */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="user-name-ar">{t("admin.nameAr")}</Label>
          <Input
            id="user-name-ar"
            name="nameAr"
            dir="rtl"
            lang="ar"
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.nameAr ? true : undefined}
            aria-describedby={fieldErrors.nameAr ? "user-name-ar-error" : undefined}
          />
          {fieldErrors.nameAr ? (
            <p id="user-name-ar-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.nameAr}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
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

        <div className="flex flex-col gap-2">
          <Label id="user-role-label">{t("common.role")}</Label>
          <SearchableSelect
            aria-labelledby="user-role-label"
            aria-describedby={fieldErrors.role ? "user-role-error" : undefined}
            invalid={fieldErrors.role ? true : undefined}
            options={options}
            value={role}
            onChange={setRole}
            disabled={pending}
            placeholder={t("forms.choose")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("forms.noMatch")}
          />
          {/* A role with no floor, refused while companies are still on the
              account (D91): the sentence sits under the field it is about. */}
          {fieldErrors.role ? (
            <p id="user-role-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.role}
            </p>
          ) : null}
        </div>

        {mode === "create" ? (
          <div className="flex flex-col gap-2">
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
