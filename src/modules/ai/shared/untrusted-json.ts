/**
 * src/modules/ai/shared/untrusted-json.ts
 *
 * Single serialization routine for UNTRUSTED business text (preferences, memory)
 * that is placed inside a delimited block of a system instruction. Pure, no I/O.
 *
 * Why JSON: JSON.stringify escapes quotes, backslashes, newlines/carriage returns,
 * every C0 control character and lone surrogates, and every value stays inside a
 * string, so text cannot start a new line, a new record or a new key. On top of
 * that this module \uXXXX-escapes the characters that JSON leaves raw but that can
 * forge structure or hide text: < > & (tag/entity forging), DEL and C1 controls,
 * soft hyphen, Arabic letter mark, Mongolian vowel separator, zero-width / bidi /
 * line-separator / invisible-operator characters, BOM, interlinear annotation
 * marks, fullwidth and small-form bracket look-alikes and Unicode tag characters.
 *
 * Escaping (not stripping) is deliberate: legitimate text keeps its meaning. For
 * example the zero-width joiner and non-joiner are required to spell some Indic and
 * Persian words correctly; they are encoded, not deleted. The model receives the
 * decoded characters of a JSON string it was told is data.
 *
 * This is a MITIGATION, not a guarantee. A model can still be persuaded by
 * adversarial text inside well-formed data.
 */

// Code-point ranges (not a regex literal) keep this source plain ASCII.
const ESCAPE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x26, 0x26], [0x3c, 0x3c], [0x3e, 0x3e], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfe64, 0xfe65], [0xfeff, 0xfeff],
  [0xff1c, 0xff1c], [0xff1e, 0xff1e], [0xfff9, 0xfffb], [0xe0000, 0xe007f],
];
function needsExtraEscape(codePoint: number): boolean {
  for (const [lo, hi] of ESCAPE_RANGES) if (codePoint >= lo && codePoint <= hi) return true;
  return false;
}

export function escapeJsonForDelimitedBlock(json: string): string {
  let out = "";
  for (const ch of json) {
    if (needsExtraEscape(ch.codePointAt(0)!)) {
      for (let i = 0; i < ch.length; i++) out += "\\u" + ch.charCodeAt(i).toString(16).padStart(4, "0");
    } else out += ch;
  }
  return out;
}

/** JSON.stringify + the extra escaping above. The result is always a single line. */
export function serializeUntrustedJson(value: unknown): string {
  return escapeJsonForDelimitedBlock(JSON.stringify(value));
}

/** Truncates to at most `max` Unicode code points (never splits a surrogate pair). */
export function truncateToCodePoints(text: string, max: number): { text: string; truncated: boolean } {
  const points = Array.from(text);
  if (points.length <= max) return { text, truncated: false };
  return { text: points.slice(0, max).join(""), truncated: true };
}
