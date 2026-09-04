/**
 * Isolating what a message drops into a sentence.
 *
 * Every screen already wraps a code in `<span dir="ltr">` when it renders one
 * itself — a quotation number, a phone, a target. A translated sentence cannot:
 * `"طلب {rep} عرض السعر {label}."` hands next-intl two runs of unknown
 * direction and gets back one flat string, and the bidi algorithm then resolves
 * the punctuation around them against the paragraph rather than against the run
 * it belongs to. A name beginning with a digit or a bracket ("3M Arabia",
 * "(Al) Rajhi Steel"), an English project name inside «guillemets», a reason
 * after a colon — each puts a neutral character next to a value whose direction
 * only the value knows.
 *
 * Unicode has the answer and it is one character each side: FSI takes its
 * direction from the first strong character INSIDE it, PDI closes it, and
 * everything between is settled before the surrounding sentence is laid out.
 * It is what `<bdi>` compiles to, applied where the substitution happens.
 *
 * Doing it here, once, at the point every message is loaded, is what makes it
 * a property of the app rather than a habit: a message written next year gets
 * it without anybody remembering, and there is no second copy of the rule in
 * forty components to fall out of step. Both locales — an Arabic company name
 * in an English sentence is the same problem facing the other way.
 *
 * Invisible, zero-width, and ignored by screen readers. Playwright sees them
 * because the specs build their expected strings from these same files.
 */

/** First-strong isolate: direction comes from what is inside. */
const FSI = "⁨";
/** Pop directional isolate. */
const PDI = "⁩";

const IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * What a `{` means at this point in the message. Inside a plural or select,
 * a `{` opens one of its sub-messages ("one {…}"), not another argument —
 * which is why this is a stack and not a boolean, and why `{count, plural,
 * one {# day} other {# days}}` comes back untouched.
 */
type Frame = "message" | "argument";

export function isolatePlaceholders(message: string): string {
  if (!message.includes("{")) return message;

  const frames: Frame[] = ["message"];
  let out = "";
  let i = 0;

  while (i < message.length) {
    const char = message[i];

    // ICU quoting: '' is one apostrophe, and '{ starts a literal run that ends
    // at the next lone '. Neither is an argument, and neither is ours to touch.
    if (char === "'") {
      const next = message[i + 1];
      if (next === "'") {
        out += "''";
        i += 2;
        continue;
      }
      if (next === "{" || next === "}" || next === "#" || next === "|") {
        const end = message.indexOf("'", i + 2);
        const stop = end === -1 ? message.length : end + 1;
        out += message.slice(i, stop);
        i = stop;
        continue;
      }
      out += char;
      i += 1;
      continue;
    }

    if (char === "}") {
      if (frames.length > 1) frames.pop();
      out += char;
      i += 1;
      continue;
    }

    if (char !== "{") {
      out += char;
      i += 1;
      continue;
    }

    if (frames[frames.length - 1] === "argument") {
      frames.push("message");
      out += char;
      i += 1;
      continue;
    }

    const close = message.indexOf("}", i + 1);
    const comma = message.indexOf(",", i + 1);
    const simple = close !== -1 && (comma === -1 || close < comma);
    const name = simple ? message.slice(i + 1, close).trim() : "";

    if (simple && IDENT.test(name)) {
      // Already isolated — the loader is allowed to run twice.
      const before = out.endsWith(FSI);
      out += before ? message.slice(i, close + 1) : FSI + message.slice(i, close + 1) + PDI;
      i = close + 1;
      continue;
    }

    frames.push("argument");
    out += char;
    i += 1;
  }

  return out;
}

/** The same, over a loaded messages tree. */
export function isolateMessages<T>(node: T): T {
  if (typeof node === "string") return isolatePlaceholders(node) as T;
  if (Array.isArray(node)) return node.map(isolateMessages) as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) out[key] = isolateMessages(value);
    return out as T;
  }
  return node;
}
