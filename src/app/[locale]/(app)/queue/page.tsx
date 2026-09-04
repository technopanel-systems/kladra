import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function QueuePage() {
  await requireUser();
  return (
    <Placeholder titleKey="common.queue" sentenceKey="shell.emptyQueue" />
  );
}
