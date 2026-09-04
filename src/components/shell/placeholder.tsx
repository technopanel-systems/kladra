import { getTranslations } from "next-intl/server";

/**
 * A screen whose slice is not built yet: the title and one sentence saying what
 * will live here.
 *
 * No button. It used to render the action the sentence names, disabled, twice,
 * wearing the brand gradient — the one visual signal reserved for "this is the
 * thing to press". A rep pressed it, nothing happened, and the screen read as
 * broken rather than as unfinished. A control that cannot be used is not
 * rendered as a control (DESIGN §5); the sentence carries the news instead, and
 * where the work can already be done somewhere else, it says where.
 */
export async function Placeholder({
  titleKey,
  sentenceKey,
}: {
  titleKey: string;
  sentenceKey: string;
}) {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
      <div className="card-face flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="max-w-prose text-sm text-muted-foreground">{t(sentenceKey)}</p>
      </div>
    </div>
  );
}
