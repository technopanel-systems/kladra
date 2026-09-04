import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/**
 * A screen before its slice is built: the title, one sentence, and the action
 * that sentence points at (SPEC §3 — every empty list shows one sentence and
 * its primary action). The button is disabled until P3–P6 wire the real thing.
 *
 * The primary action sits at the top, never at the bottom (DESIGN §2); the
 * empty card repeats it where the eye already is.
 */
export async function Placeholder({
  titleKey,
  sentenceKey,
  actionKey,
}: {
  titleKey: string;
  sentenceKey: string;
  actionKey?: string;
}) {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
        {actionKey ? (
          // The brand gradient lives on the primary button and nowhere else.
          <Button disabled className="bg-(image:--brand-grad) text-brand-ink shadow-(--brand-glow)">
            {t(actionKey)}
          </Button>
        ) : null}
      </div>

      <div className="card-face flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="max-w-prose text-sm text-muted-foreground">{t(sentenceKey)}</p>
        {actionKey ? (
          <Button variant="outline" disabled>
            {t(actionKey)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
