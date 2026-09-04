"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { signInAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/types";

/** Both fields point at the one error line, so a screen reader reads it too. */
const ERROR_ID = "login-error";

/**
 * Email and password, with real <label>s — a rep signing in on a phone gets a
 * tap target the size of the words, and the acceptance tests find the fields
 * by their label in either language.
 *
 * The error is one line under the fields and never says which half was wrong;
 * `signInAction` decides that, and it answers the same way every time.
 *
 * The email is a controlled value on purpose: React resets an uncontrolled
 * form once its action returns, so after a refused attempt the address a rep
 * had just typed on a phone would vanish and have to be typed again. The
 * password is left to reset — retyping that is the point.
 */
export function LoginForm() {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    signInAction,
    null,
  );
  const failed = state !== null && !state.ok;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={failed || undefined}
          aria-describedby={failed ? ERROR_ID : undefined}
          // An address is Latin script and reads left to right in both locales.
          dir="ltr"
          className="h-9 text-start"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={failed || undefined}
          aria-describedby={failed ? ERROR_ID : undefined}
          className="h-9"
        />
      </div>

      {failed ? (
        <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        // The one primary action on the screen, so the one brand gradient
        // (DESIGN.md §1). Both values are tokens from globals.css.
        className="mt-1 w-full bg-[image:var(--brand-grad)] text-primary-foreground shadow-[var(--brand-glow)] hover:opacity-90"
      >
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
