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
 *
 * **Two more facts the panel cannot work out for itself.**
 *
 * Whether this is a viewer. An admin looking through somebody's eyes reads
 * every screen and writes nothing — `requireActor` refuses all four of these
 * actions (D42, P8.8) — so Add user, Edit, Reset password and Deactivate are
 * absent rather than present and refusing. He came here to see what the manager
 * sees, and what the manager sees is the list.
 *
 * And whether the reader is the ONLY active admin. `updateUserAction` refuses a
 * role change that would leave the app with nobody who can administer it, and
 * the row it would be pressed on is his own: the form says so where he would
 * have chosen instead of after he has (D119).
 */
export default async function AdminUsersPage() {
  const viewer = await requireOffice();

  const [t, people] = await Promise.all([getTranslations(), listUsers()]);

  const viewing = Boolean(viewer.viewedBy);
  // Asked of the list this screen is already holding rather than of a second
  // query: the rows are every account there is, which is what "the only one
  // left" is counted over.
  const activeAdmins = people.filter((person) => person.role === "admin" && person.active);
  const lastAdmin =
    activeAdmins.length === 1 && activeAdmins[0].id === viewer.id;

  return (
    <UsersPanel
      title={t("common.users")}
      users={people.map((person) => ({
        ...person,
        mayManage: !viewing && mayActOnUser(viewer.role, person.role),
      }))}
      me={{ id: viewer.id, role: viewer.role, viewing, lastAdmin }}
      roles={assignableRoles(viewer.role)}
    />
  );
}
