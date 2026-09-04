// The ONLY place next/link and next/navigation are imported for routing.
// Everywhere else imports Link, redirect, usePathname, useRouter from here so
// the locale prefix is never dropped (hook H5).
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
