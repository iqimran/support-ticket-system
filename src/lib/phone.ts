// Bangladesh-only phone normalization strategy.
//
// This project only supports Bangladeshi mobile numbers right now — there is
// no requirement yet to support other countries, and guessing at an
// international format would risk silently mis-normalizing (and therefore
// mis-deduplicating) a customer's number. If international support is
// needed later, this module is the single place to extend.
//
// Accepted raw inputs (after stripping spaces/dashes/parens):
//   01712345678      (11-digit local form, the way people usually write it)
//   1712345678       (10-digit local form without the leading 0)
//   8801712345678    (country code, no +)
//   +8801712345678   (E.164)
//
// Canonical stored/compared form: E.164, e.g. "+8801712345678".
//
// A valid Bangladeshi mobile number is 11 digits locally: 01[3-9]XXXXXXXX —
// leading 0, then 1, then a mobile operator digit 3-9 (013/014/015/016/017/
// 018/019 are the seven assigned ranges), then 8 more digits.

const BD_LOCAL_MOBILE_REGEX = /^01[3-9]\d{8}$/;
const BD_E164_REGEX = /^\+8801[3-9]\d{8}$/;

/**
 * Normalizes a Bangladeshi mobile number to canonical E.164 form
 * ("+8801XXXXXXXXX"). Returns null if the input isn't a recognizable
 * Bangladeshi mobile number — callers should surface that as a validation
 * error rather than storing an unnormalized value.
 */
export function normalizeBangladeshiPhone(rawInput: string): string | null {
  const cleaned = rawInput.trim().replace(/[\s\-()]/g, "");
  const digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  if (!/^\d+$/.test(digits)) return null;

  let local: string;
  if (digits.length === 13 && digits.startsWith("880")) {
    local = `0${digits.slice(3)}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    local = digits;
  } else if (digits.length === 10 && digits.startsWith("1")) {
    local = `0${digits}`;
  } else {
    return null;
  }

  if (!BD_LOCAL_MOBILE_REGEX.test(local)) return null;

  const e164 = `+880${local.slice(1)}`;
  return BD_E164_REGEX.test(e164) ? e164 : null;
}

/** "+8801712345678" -> "01712345678", for display in forms/tables. */
export function formatBangladeshiPhoneForDisplay(e164Phone: string): string {
  return BD_E164_REGEX.test(e164Phone) ? `0${e164Phone.slice(4)}` : e164Phone;
}

/**
 * Strips whatever prefix (+880 / 880 / 0) the user typed so a partial or
 * full phone search matches the stored E.164 value regardless of the format
 * it was typed in. Returns "" if the query has no digits at all (a pure
 * name search), so callers can tell "no phone signal" apart from "search
 * for a number with no digits" (which would otherwise match everything).
 */
export function extractPhoneSearchDigits(query: string): string {
  const digits = query.replace(/\D/g, "");
  if (digits.startsWith("880")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}
