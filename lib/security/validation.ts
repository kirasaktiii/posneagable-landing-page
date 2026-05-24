import { sanitizePlainText } from "@/lib/security/sanitize";

export const MAX_NAME_LENGTH = 100;
export const MAX_PHONE_DIGITS = 15;

const INDONESIA_PHONE_PATTERN = /^(?:\+62|62|0)8\d{7,13}$/;

export type PhoneValidationResult =
  | {
      ok: true;
      normalized: string;
      display: string;
      digits: string;
    }
  | {
      ok: false;
      message: string;
    };

export function sanitizeName(input: unknown): string {
  return sanitizePlainText(input, { maxLength: MAX_NAME_LENGTH });
}

export function sanitizeAddress(input: unknown): string {
  return sanitizePlainText(input, { maxLength: 300, preserveLineBreaks: true });
}

export function sanitizeNotes(input: unknown): string {
  return sanitizePlainText(input, { maxLength: 300, preserveLineBreaks: true });
}

export function validateIndonesiaPhone(rawPhone: unknown): PhoneValidationResult {
  const rawSanitized = sanitizePlainText(rawPhone, { maxLength: 40 });
  const compact = rawSanitized.replace(/[\s().-]+/g, "");

  if (!compact) {
    return { ok: false, message: "Nomor HP wajib diisi." };
  }

  if (!INDONESIA_PHONE_PATTERN.test(compact)) {
    return {
      ok: false,
      message:
        "Nomor HP tidak valid. Gunakan format Indonesia: 08xx atau +62xx.",
    };
  }

  const digits = compact.replace(/\D/g, "");
  if (digits.length > MAX_PHONE_DIGITS) {
    return {
      ok: false,
      message: `Nomor HP maksimal ${MAX_PHONE_DIGITS} digit.`,
    };
  }

  const normalized = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits.startsWith("62")
      ? digits
      : digits.startsWith("8")
        ? `62${digits}`
        : digits;

  if (!normalized.startsWith("628")) {
    return {
      ok: false,
      message:
        "Nomor HP tidak valid. Gunakan format Indonesia: 08xx atau +62xx.",
    };
  }

  return {
    ok: true,
    normalized,
    display: `+${normalized}`,
    digits,
  };
}

export function maskPhone(normalizedPhone: string): string {
  if (!normalizedPhone) {
    return "";
  }

  if (normalizedPhone.length <= 6) {
    return `${normalizedPhone.slice(0, 2)}****`;
  }

  return `${normalizedPhone.slice(0, 4)}****${normalizedPhone.slice(-3)}`;
}

export function sanitizeOrderIdLast4(input: unknown): string {
  return sanitizePlainText(input, { maxLength: 4 }).replace(/\D/g, "").slice(0, 4);
}
