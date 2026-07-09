export const ALLOWED_PHONE_DIAL_CODES = ["+91", "+1", "+44", "+971", "+966", "+65", "+61", "+49", "+974"] as const;

export const DEFAULT_PHONE_DIAL_CODE = "+91";

export type PhoneDialCode = (typeof ALLOWED_PHONE_DIAL_CODES)[number];

export function isAllowedPhoneDialCode(value: string): value is PhoneDialCode {
  return (ALLOWED_PHONE_DIAL_CODES as readonly string[]).includes(value);
}

export function sanitizeNationalPhoneNumber(value: string): string {
  return value.replace(/[^\d\s-]/g, "").replace(/\s+/g, " ").trim();
}

export function formatPhoneDisplay(dialCode: string, nationalNumber: string): string {
  const number = sanitizeNationalPhoneNumber(nationalNumber);
  if (!number) return "";
  const code = isAllowedPhoneDialCode(dialCode) ? dialCode : DEFAULT_PHONE_DIAL_CODE;
  return `${code} ${number}`;
}

export function splitPhoneNumber(
  fullNumber: string,
  fallbackDialCode: PhoneDialCode = DEFAULT_PHONE_DIAL_CODE
): { dialCode: PhoneDialCode; nationalNumber: string } {
  const trimmed = fullNumber.trim();
  if (!trimmed) {
    return { dialCode: fallbackDialCode, nationalNumber: "" };
  }

  if (trimmed.startsWith("+")) {
    const sortedCodes = [...ALLOWED_PHONE_DIAL_CODES].sort((a, b) => b.length - a.length);
    for (const dialCode of sortedCodes) {
      if (trimmed.startsWith(dialCode)) {
        return {
          dialCode,
          nationalNumber: sanitizeNationalPhoneNumber(trimmed.slice(dialCode.length)),
        };
      }
    }
  }

  return { dialCode: fallbackDialCode, nationalNumber: sanitizeNationalPhoneNumber(trimmed) };
}

export function normalizePhoneDialCode(value: string | undefined): PhoneDialCode {
  if (value && isAllowedPhoneDialCode(value)) return value;
  return DEFAULT_PHONE_DIAL_CODE;
}
