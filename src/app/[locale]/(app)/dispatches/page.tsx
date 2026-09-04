import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function DispatchesPage() {
  await requireUser();
  return (
    <Placeholder titleKey="common.dispatches" sentenceKey="shell.emptyDispatches" />
  );
}
