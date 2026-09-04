import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { getUser, homeFor } from "@/lib/authz";

import { LoginForm } from "./login-form";

// Reads the session cookie, so never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signIn") };
}

/**
 * The only screen a signed-out person can reach. One card on the canvas: the
 * wordmark, two fields, one primary button, and the language link — a rep who
 * finds English hard switches before typing anything (SPEC §2 S6).
 */
export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Already signed in: this screen has nothing to offer.
  const user = await getUser();
  if (user) redirect({ href: homeFor(user.role), locale });

  const t = await getTranslations();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <div className="w-full max-w-sm">
      <header className="mb-7 flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-xl bg-brand text-base font-semibold text-primary-foreground shadow-[var(--brand-glow)]"
        >
          K
        </span>
        <span className="font-heading text-2xl font-semibold tracking-tight">{t("common.app")}</span>
      </header>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-lg">{t("auth.signIn")}</CardTitle>
          <CardDescription>{t("auth.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>

      <div className="mt-6 flex items-start justify-between gap-4 text-sm">
        <p className="text-faint">{t("auth.accountsFromAdmin")}</p>
        <Link
          href="/login"
          locale={other}
          lang={other}
          className="shrink-0 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {other === "ar" ? t("common.arabic") : t("common.english")}
        </Link>
      </div>
    </div>
  );
}
