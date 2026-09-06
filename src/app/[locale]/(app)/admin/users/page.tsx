import { getTranslations } from "next-intl/server";
import { UsersPanel } from "@/components/admin/users-panel";
import { requireAdmin } from "@/lib/authz";
import { listUsers } from "@/lib/admin";

/**
 * Who uses Kladra (SPEC S7, §3).
 *
 * Nobody self-registers; the admin creates accounts and resets passwords. An
 * account is deactivated, never deleted, so every company, quotation and log
 * entry keeps pointing at a real person.
 */
export default async function AdminUsersPage() {
  const user = await requireAdmin();
  // The rail never offers Admin to anyone else; a typed URL goes home.

  const [t, users] = await Promise.all([getTranslations(), listUsers()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.users")}</h1>
      {users.length === 0 ? (
        <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
          {t("shell.emptyUsers")}
        </p>
      ) : (
        <UsersPanel users={users} meId={user.id} />
      )}
    </div>
  );
}
