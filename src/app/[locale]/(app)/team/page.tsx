import { Placeholder } from "@/components/shell/placeholder";
import { requireUser } from "@/lib/authz";

export default async function TeamPage() {
  await requireUser();
  return (
    <Placeholder titleKey="shell.team" sentenceKey="shell.emptyTeam" />
  );
}
