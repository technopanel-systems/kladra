"use client";

import { ChevronsUpDown, LogOut, Moon, Sun } from "lucide-react";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { signOutAction } from "@/actions/auth";
import { setLocaleAction, setThemeAction } from "@/actions/prefs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "@/i18n/navigation";
import type { Role } from "@/lib/types";
import type { Theme } from "@/lib/theme";

/**
 * Who is signed in, and the two things they can change about the app: the
 * theme (this browser) and the language (this person) — SPEC D16. The role is
 * shown as a word, never as `rep` or a code.
 */

/** First letters of the first two words; codepoint-safe, so Arabic works. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();
}

export function UserMenu({ name, role, theme }: { name: string; role: Role; theme: Theme }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function chooseTheme(value: string) {
    if (value === theme) return;
    startTransition(async () => {
      await setThemeAction(value);
    });
  }

  function chooseLocale(value: string) {
    if (value === locale) return;
    startTransition(async () => {
      const result = await setLocaleAction(value, pathname);
      // A FULL document load, not router.push: `<html lang dir>` lives in the
      // root layout, which Next does not re-render on a client navigation. A
      // soft one left the page right-to-left while the words turned English.
      if (result.ok && result.data) window.location.assign(result.data.href);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          aria-label={t("shell.accountMenu")}
          className="h-11 gap-2 px-1.5 md:h-9 md:px-2"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-(image:--avatar-user-grad) text-[11px] font-semibold text-brand-ink">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>
          {/* 36 (144px) cut "Abdulrahman Al-Zahrani" mid-surname at 1366, where
              there is room to spare. Widen once the viewport can afford it. */}
          <span className="hidden min-w-0 flex-col items-start leading-tight md:flex">
            <span className="max-w-36 truncate text-[13px] font-medium lg:max-w-56">{name}</span>
            <span className="max-w-36 truncate text-[11px] font-normal text-muted-foreground lg:max-w-56">
              {t(`common.${role}`)}
            </span>
          </span>
          <ChevronsUpDown className="hidden size-3.5 text-muted-foreground md:block" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60!">
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{t(`common.${role}`)}</span>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("common.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={chooseTheme}>
          <DropdownMenuRadioItem value="dark" disabled={pending}>
            <Moon className="size-4 text-muted-foreground" />
            {t("common.dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" disabled={pending}>
            <Sun className="size-4 text-muted-foreground" />
            {t("common.light")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={chooseLocale}>
          <DropdownMenuRadioItem value="en" disabled={pending}>
            {t("common.english")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ar" disabled={pending}>
            {t("common.arabic")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut className="size-4 text-muted-foreground" />
              {t("common.signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
