/**
 * What Auth.js hands the rest of Kladra.
 *
 * `session.user` is the SessionUser of src/lib/types.ts plus `active`, which
 * `src/lib/authz.ts` reads to refuse a session whose user was deactivated
 * mid-request. The fields are filled by the adapter's `getSessionAndUser`, so
 * they are the row's current values on every request — never a stale copy
 * baked into a token.
 *
 * The augmentations name `@auth/core/*`, not `next-auth/*`: next-auth's own
 * `types` and `adapters` entry points are pure re-exports
 * (`export type * from "@auth/core/adapters"`), and an augmentation of a
 * re-export declares a second, unrelated interface instead of merging.
 */
import type { Role } from "@/lib/types";

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      locale: "en" | "ar";
      /** False the moment the admin deactivates the account (SPEC §3, D17). */
      active: boolean;
    };
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    /** `users.name` is NOT NULL; Auth.js's own type leaves it optional. */
    name: string;
    role: Role;
    locale: "en" | "ar";
    active: boolean;
  }
}

export {};
