import { notFound } from "next/navigation";

/**
 * Every address under the shell that no screen claims. Without this, Next
 * answers with its own page, in its own face and in English only; with it,
 * the shell's `not-found.tsx` answers — signed in, in the reader's language,
 * with the rail still there (§5 #20).
 */
export default function NoSuchScreen(): never {
  notFound();
}
