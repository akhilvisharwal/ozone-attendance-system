import clsx from "clsx";
import { FieldWrapper } from "@/components/ui/Input";
import { PhoneCountryCombobox } from "@/components/settings/PhoneCountryCombobox";
import {
  DEFAULT_PHONE_DIAL_CODE,
  sanitizeNationalPhoneNumber,
} from "@/constants/phoneCountries";

const inputClassName =
  "min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:py-2 sm:text-sm";

export function PhoneNumberField({
  label,
  required,
  hint,
  error,
  dialCode,
  nationalNumber,
  onDialCodeChange,
  onNationalNumberChange,
  placeholder = "98765 43210",
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  dialCode: string;
  nationalNumber: string;
  onDialCodeChange: (dialCode: string) => void;
  onNationalNumberChange: (nationalNumber: string) => void;
  placeholder?: string;
}) {
  const selectedDialCode = dialCode || DEFAULT_PHONE_DIAL_CODE;
  const hasError = Boolean(error);

  return (
    <FieldWrapper label={label} required={required} hint={hint} error={error}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <PhoneCountryCombobox
          dialCode={selectedDialCode}
          onDialCodeChange={onDialCodeChange}
          error={hasError}
          ariaLabel={`${label} country code`}
          className="w-full shrink-0 sm:w-[13rem]"
        />
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          onChange={(e) => onNationalNumberChange(sanitizeNationalPhoneNumber(e.target.value))}
          placeholder={placeholder}
          className={clsx(inputClassName, hasError && "border-red-400 focus:border-red-500 focus:ring-red-100")}
        />
      </div>
    </FieldWrapper>
  );
}
