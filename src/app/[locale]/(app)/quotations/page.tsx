import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function QuotationsPage() {
  await requireUser();
  return (
    <Placeholder titleKey="common.quotations" sentenceKey="shell.emptyQuotations" actionKey="shell.requestQuotation" />
  );
}
