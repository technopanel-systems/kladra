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
 * `signInAction` decides that, and it answers the same way every time. Its line
 * is always in the layout, empty until there is something to say, so that the
 * answer arriving does not move the screen.
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
    // noValidate: the browser's own bubble is in the browser's language, not
    // the app's, and the sign-in screen is the first thing anyone sees
    // (DESIGN §5). The action answers instead.
    <form action={action} noValidate className="flex flex-col gap-4">
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
          // A password is typed in Latin, like the address above it. Left to
          // the page it inherited RTL and started its dots from the right.
          dir="ltr"
          aria-invalid={failed || undefined}
          aria-describedby={failed ? ERROR_ID : undefined}
          className="h-9"
        />
      </div>

      {/* The slot is here whether or not there is anything in it. The card
          grew by a line when the answer came back, and because the whole block
          is centred on the canvas the wordmark jumped UP eighteen pixels and
          the language link jumped DOWN eighteen — the page moving under
          somebody at the exact moment they are reading why they were refused
          (D67). One line is enough: the sentence is the same one every time
          and fits on one at 375. */}
      <p
        id={ERROR_ID}
        role="alert"
        className="min-h-5 text-sm leading-5 text-destructive"
        dir="auto"
      >
        {failed ? state.error : null}
      </p>

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
