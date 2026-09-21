/**
 * Digits as the app writes them (D6: Western digits everywhere).
 *
 * A phone's Arabic keyboard types ٠٥٥ and ١٢٫٥, and until the P13 audit every
 * number box in the app refused them: `\d` is ASCII in JavaScript, `Number("١٢")`
 * is NaN, and a rep typing a customer's mobile the way his keyboard offers it was
 * told the number was not a number. Pure and tiny, so the browser and the server
 * fold the same way: the shared `Input` folds as he types in a box that asks for
 * figures, and the two parsers a pasted value can still reach (`normalizePhone`,
 * `toNumber`) fold again.
 */

/** Arabic-Indic (٠–٩) and Extended Arabic-Indic (۰–۹) digits as 0–9. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

export function westernDigits(text: string): string {
  // Both ranges end in the digit's own value: U+0660 & 0xF is 0, U+06F9 & 0xF is 9.
  return text.replace(EASTERN_DIGITS, (d) => String(d.charCodeAt(0) & 0xf));
}

/** A typed figure: its digits, and the Arabic decimal mark (٫) and thousands mark (٬) as ours. */
export function westernFigure(text: string): string {
  return westernDigits(text).replace(/٫/g, ".").replace(/٬/g, "");
}
