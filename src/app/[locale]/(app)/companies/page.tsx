import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function CompaniesPage() {
  await requireUser();
  return (
    <Placeholder titleKey="common.companies" sentenceKey="shell.emptyCompanies" actionKey="shell.addCompany" />
  );
}
