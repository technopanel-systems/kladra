import { NotebookPen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { owesToday } from "@/lib/reports";
import type { Role } from "@/lib/types";

/**
 * One quiet line at the foot of a rep's day: the report is not written yet
 * (SPEC D55).
 *
 * It is a link and not a form. The whole of the report screen is one box and a
 * Save, and putting a second copy of that box here would put the writing in two
 * places and the reading in one — so this costs a rep one tap and the screen it
 * opens costs him the minute Jerom asked for.
 *
 * It disappears the moment he writes, and never appears on a day he did not
 * work. A reminder that is always lit is decoration.
 */
export async function CloseTheDay({ userId, role }: { userId: string; role: Role }) {
  if (!(await owesToday(userId, role))) return null;
  const t = await getTranslations("reports");

  return (
    <Link
      href="/reports"
      className="card-face flex items-center gap-2.5 p-3 text-sm transition-colors hover:bg-surface-2"
    >
      <NotebookPen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      {t("closeTheDay")}
    </Link>
  );
}
