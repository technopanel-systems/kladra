import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function ProjectsPage() {
  await requireUser();
  return (
    <Placeholder titleKey="common.projects" sentenceKey="shell.emptyProjects" actionKey="shell.addProject" />
  );
}
