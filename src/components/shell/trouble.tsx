"use client";

import { useLocale, useTranslations } from "next-intl";
import { BrandMark } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";

/**
 * What a screen shows when it cannot show itself (DESIGN §2: never a blank —
 * a blank reads as broken). Two cases wear one face: a screen that failed
 * (`error.tsx`, with a way to try again) and an address that names no screen
 * (`not-found.tsx`). Neither carries a digest, a stack or a status code — an
 * internal code on screen is a thing a rep cannot act on (DESIGN §2); the
 * cause is in the server log.
 *
 * Home is a plain anchor, a full document load, on purpose. After a failure
 * the client tree is the thing in doubt, and a soft navigation would carry it
 * along. `/{locale}` is nobody's screen; the app index sends each role to its
 * own (SPEC D15).
 *
 * `bare` is for the boundary above the shell, where there is no rail to say
 * whose app this is — the mark stands in for it, as on the sign-in screen.
 */
export function Trouble({
  kind,
  onRetry,
  bare = false,
}: {
  kind: "failed" | "missing";
  /** `error.tsx`'s reset. Absent on the not-found page: there is nothing to retry. */
  onRetry?: () => void;
  bare?: boolean;
}) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const failed = kind === "failed";

  const card = (
    <div
      role={failed ? "alert" : undefined}
      data-slot="trouble"
      className="card-face flex w-full max-w-md flex-col items-start gap-5 p-6"
    >
      {bare ? <BrandMark /> : null}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold">
          {failed ? t("failedTitle") : t("missingTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {failed ? t("failedBody") : t("missingBody")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <Button type="button" variant="brand" onClick={onRetry}>
            {t("tryAgain")}
          </Button>
        ) : null}
        <Button asChild variant={onRetry ? "outline" : "brand"}>
          <a href={`/${locale}`}>{t("goHome")}</a>
        </Button>
      </div>
    </div>
  );

  if (!bare) return card;
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-12">
      {card}
    </main>
  );
}
