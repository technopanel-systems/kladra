import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function NotificationsPage() {
  await requireUser();
  return (
    <Placeholder titleKey="common.notifications" sentenceKey="shell.emptyNotifications" actionKey="common.markAllRead" />
  );
}
