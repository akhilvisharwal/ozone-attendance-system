export interface PhoneCountryOption {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
}

export const PHONE_COUNTRIES: PhoneCountryOption[] = [
  { code: "IN", dialCode: "+91", name: "India", flag: "🇮🇳" },
  { code: "US", dialCode: "+1", name: "United States", flag: "🇺🇸" },
  { code: "GB", dialCode: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "AE", dialCode: "+971", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "SA", dialCode: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "SG", dialCode: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "AU", dialCode: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "CA", dialCode: "+1", name: "Canada", flag: "🇨🇦" },
  { code: "DE", dialCode: "+49", name: "Germany", flag: "🇩🇪" },
  { code: "QA", dialCode: "+974", name: "Qatar", flag: "🇶🇦" },
];

export const DEFAULT_PHONE_DIAL_CODE = "+91";

export const ALLOWED_PHONE_DIAL_CODES = PHONE_COUNTRIES.map((country) => country.dialCode);

export function getPhoneCountryByDialCode(dialCode: string): PhoneCountryOption | undefined {
  return PHONE_COUNTRIES.find((country) => country.dialCode === dialCode);
}

export function formatPhoneCountryLabel(country: PhoneCountryOption): string {
  return `${country.flag} ${country.name} (${country.dialCode})`;
}

export function getPhoneCountryComboboxValue(dialCode: string): string {
  return getPhoneCountryByDialCode(dialCode)?.code ?? PHONE_COUNTRIES[0].code;
}

export function formatPhoneDisplay(dialCode: string, nationalNumber: string): string {
  const number = nationalNumber.trim();
  if (!number) return "";
  const code = dialCode.trim() || DEFAULT_PHONE_DIAL_CODE;
  return `${code} ${number}`;
}

/** Split a legacy full phone value into dial code + national number when possible. */
export function splitPhoneNumber(
  fullNumber: string,
  fallbackDialCode = DEFAULT_PHONE_DIAL_CODE
): { dialCode: string; nationalNumber: string } {
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
          nationalNumber: trimmed.slice(dialCode.length).trim().replace(/^[\s-]+/, ""),
        };
      }
    }
  }

  return { dialCode: fallbackDialCode, nationalNumber: trimmed };
}

export function sanitizeNationalPhoneNumber(value: string): string {
  return value.replace(/[^\d\s-]/g, "").replace(/\s+/g, " ").trim();
}
