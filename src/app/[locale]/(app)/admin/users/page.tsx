import { getTranslations } from "next-intl/server";
import { UsersPanel } from "@/components/admin/users-panel";
import { assignableRoles, mayActOnUser, requireOffice } from "@/lib/authz";
import { listUsers } from "@/lib/admin";

/**
 * Who uses Kladra (SPEC S7, §3, P14).
 *
 * Nobody self-registers; an account is created here and passwords are reset
 * here. An account is deactivated, never deleted, so every company, quotation
 * and log entry keeps pointing at a real person.
 *
 * The sales manager reads and works this screen as well as the admin (P14):
 * he is the one who hires a rep and is asked to let him in on the first
 * morning. What he may not do is one sentence in `src/lib/authz.ts`, and the
 * screen asks it here, per row and for the picker, so it can offer nothing the
 * action would refuse (DESIGN §5).
 */
export default async function AdminUsersPage() {
  const viewer = await requireOffice();

  const [t, people] = await Promise.all([getTranslations(), listUsers()]);

  return (
    <UsersPanel
      title={t("common.users")}
      users={people.map((person) => ({
        ...person,
        mayManage: mayActOnUser(viewer.role, person.role),
      }))}
      me={{ id: viewer.id, role: viewer.role }}
      roles={assignableRoles(viewer.role)}
    />
  );
}
