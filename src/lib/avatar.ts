/**
 * Who an avatar is, as a colour and a letter or two (DESIGN §1b).
 *
 * Pure — no DOM, no database — so `tests/avatar.spec.ts` asks it directly, and
 * the server and the browser draw the same person the same way.
 *
 * The colour is identity, not state: a hash of the record's own id picks one of
 * eight quiet tints, so Faisal is one colour on every screen for as long as he
 * exists, and renaming him does not repaint him. Eight rather than Twenty's 25:
 * on these grounds twenty-five hues is a fruit bowl, and a tint that could be
 * mistaken for the amber of "somebody owes an answer" would be a lie.
 */

export const AVATAR_TINTS = 8;

/** 1…8. FNV-1a over the UTF-16 units: fast, stable, and spread well on uuids. */
export function avatarTint(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % AVATAR_TINTS) + 1;
}

const LETTER = /\p{L}/u;
const ARABIC = /\p{Script=Arabic}/u;
/** A word that names what kind of business it is, not which one. */
const ARABIC_KIND = new Set(["شركة", "مؤسسة", "مصنع", "مكتب", "ورشة", "مجموعة"]);

function firstLetter(word: string): string {
  return [...word].find((ch) => LETTER.test(ch)) ?? "";
}

/**
 * The letters inside the circle, in the script the name is written in (D68).
 *
 * Latin: the first letters of the first and last words, with the "Al-" of a
 * family name set aside, so Faisal Al-Harbi is FH and not FA — the letter that
 * tells him from Faisal Al-Qahtani. Arabic: ONE letter, because two isolated
 * Arabic letters join into a fragment of a word that is not his name; the
 * definite article and a leading "شركة" or "مؤسسة" are set aside for the same
 * reason the Latin "Al-" is, so twelve contractors are not all ش.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => LETTER.test(word));
  if (words.length === 0) return "";

  if (ARABIC.test(firstLetter(words[0]))) {
    const named = words.length > 1 && ARABIC_KIND.has(words[0]) ? words[1] : words[0];
    const bare = named.length > 3 && named.startsWith("ال") ? named.slice(2) : named;
    return firstLetter(bare);
  }

  const bare = words.map((word) => word.replace(/^(al|el)-(?=\p{L})/iu, ""));
  const first = firstLetter(bare[0]);
  if (bare.length === 1) return first.toUpperCase();
  return (first + firstLetter(bare[bare.length - 1])).toUpperCase();
}
