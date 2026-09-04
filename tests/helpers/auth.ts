import type { Locator, Page } from "@playwright/test";
import { loadEnv } from "@/lib/env";
import { getTranslator, type Locale } from "./i18n";

loadEnv();

/** The six seed accounts (README.md "Seed logins" — scripts/seed-demo.ts, P2). */
export type Persona = "faisal" | "saad" | "turki" | "rawan" | "abdulrahman" | "jerom";

const EMAILS: Record<Persona, string> = {
  faisal: "faisal@technopanel.com.sa",
  saad: "saad@technopanel.com.sa",
  turki: "turki@technopanel.com.sa",
  rawan: "rawan@technopanel.com.sa",
  abdulrahman: "abdulrahman@technopanel.com.sa",
  jerom: "jerom@technopanel.com.sa",
};

/** Every seed account shares one password (README.md "Seed logins"). */
function seedPassword(): string {
  return process.env.SEED_PASSWORD ?? "kladra2026";
}

type LoginForm = {
  email: Locator;
  password: Locator;
  submit: Locator;
  /** True while the login screen's own messages are not in messages/<locale>/auth.json yet. */
  byInputType: boolean;
};

/**
 * The three controls on the login screen.
 *
 * Preferred, and what this becomes for good once the AUTH slice lands its
 * messages: label locators built from messages/<locale>/auth.json, so neither
 * locale is matched against a hard-coded English string. `getByLabel` is
 * substring and case-insensitive by default, so the label text is passed
 * straight through — no regex escaping.
 *
 * Fallback, only while auth.json does not exist: the input's `type`. It is an
 * attribute, not a class or a structural CSS path — it survives restyling and
 * carries the field's meaning — but it is still not a label locator, so this
 * branch is temporary and is reported as such.
 */
function loginForm(page: Page, locale: Locale): LoginForm {
  const t = getTranslator(locale);
  const labelled = t.has("auth.email") && t.has("auth.password");
  return {
    email: labelled ? page.getByLabel(t("auth.email")) : page.locator('input[type="email"]'),
    password: labelled
      ? page.getByLabel(t("auth.password"))
      : page.locator('input[type="password"]'),
    submit: page.getByRole("button", {
      name: t.has("auth.signIn") ? t("auth.signIn") : t("common.signIn"),
    }),
    byInputType: !labelled,
  };
}

/**
 * Signs `who` in from a clean session: clears cookies, goes to
 * `/<locale>/login`, fills email and password, submits, and waits for the URL
 * to leave `/login`. Where that lands is the app's decision
 * (`homeFor` in src/lib/authz.ts) — callers assert their own expected screen.
 */
export async function login(page: Page, locale: Locale, who: Persona): Promise<void> {
  await page.context().clearCookies();
  await page.goto(`/${locale}/login`);

  const form = loginForm(page, locale);
  await form.email.fill(EMAILS[who]);
  await form.password.fill(seedPassword());
  await form.submit.click();

  try {
    await page.waitForURL((url) => !isLoginPath(url.pathname));
  } catch (cause) {
    throw new Error(
      `${who} (${EMAILS[who]}) did not get past /${locale}/login — still at ${page.url()}. ` +
        "Either the credentials are not seeded (npm run seed:demo) or the sign-in was refused." +
        (form.byInputType
          ? " Note: messages/*/auth.json is missing, so the fields were found by input type."
          : ""),
      { cause },
    );
  }
}

function isLoginPath(pathname: string): boolean {
  return /\/login(?:\/)?$/.test(pathname);
}
