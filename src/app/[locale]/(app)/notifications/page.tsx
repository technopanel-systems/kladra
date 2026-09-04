import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function NotificationsPage() {
  await requireUser();
  // No action: an empty list has nothing to mark read, and offering "Mark all
  // read" under "everything is read" argues with itself.
  return <Placeholder titleKey="common.notifications" sentenceKey="shell.emptyNotifications" />;
}
