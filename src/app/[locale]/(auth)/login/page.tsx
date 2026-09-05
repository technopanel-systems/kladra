import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandMark } from "@/components/shell/brand-mark";
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
 *
 * It was built before the app had its own surfaces and never came back into
 * line, which the 9E audit found three ways at once (D67). The mark was drawn
 * a second time here, in `bg-brand` — a token that changes between themes,
 * against the rule that says a logo does not change colour when somebody turns
 * the lights off. The card was the component library's, the only one left in
 * the app: a ring where every other surface has a border, and none of the
 * shadow or the hairline that make a Kladra card. And the screen had no
 * heading at all, because a CardTitle is a div — so the one page a signed-out
 * person can reach gave a screen reader nothing to land on.
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
        <BrandMark className="size-9 rounded-xl text-base" />
        <span className="font-heading text-2xl font-semibold tracking-tight">{t("common.app")}</span>
      </header>

      <div className="card-face glass flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-lg leading-snug font-medium">{t("auth.signIn")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        <LoginForm />
      </div>

      <div className="mt-6 flex items-start justify-between gap-4 text-sm">
        <p className="text-faint">{t("auth.accountsFromAdmin")}</p>
        <Link
          href="/login"
          locale={other}
          lang={other}
          className="shrink-0 rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {other === "ar" ? t("common.arabic") : t("common.english")}
        </Link>
      </div>
    </div>
  );
}
