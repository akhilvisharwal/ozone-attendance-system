import { useMemo } from "react";
import clsx from "clsx";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import {
  DEFAULT_PHONE_DIAL_CODE,
  formatPhoneCountryLabel,
  getPhoneCountryByDialCode,
  getPhoneCountryComboboxValue,
  PHONE_COUNTRIES,
} from "@/constants/phoneCountries";

export function PhoneCountryCombobox({
  dialCode,
  onDialCodeChange,
  error,
  className,
  triggerClassName,
  ariaLabel,
}: {
  dialCode: string;
  onDialCodeChange: (dialCode: string) => void;
  error?: boolean;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  const selectedDialCode = dialCode || DEFAULT_PHONE_DIAL_CODE;
  const selectedCountry =
    getPhoneCountryByDialCode(selectedDialCode) ?? getPhoneCountryByDialCode(DEFAULT_PHONE_DIAL_CODE)!;

  const options = useMemo<ComboboxOption[]>(
    () =>
      PHONE_COUNTRIES.map((country) => ({
        value: country.code,
        label: formatPhoneCountryLabel(country),
        description: country.dialCode,
      })),
    []
  );

  return (
    <Combobox
      className={className}
      options={options}
      value={getPhoneCountryComboboxValue(selectedDialCode)}
      onChange={(countryCode) => {
        const country = PHONE_COUNTRIES.find((entry) => entry.code === countryCode);
        if (country) onDialCodeChange(country.dialCode);
      }}
      placeholder={formatPhoneCountryLabel(selectedCountry)}
      searchable
      searchPlaceholder="Search countries..."
      emptyMessage="No countries found"
      selectedLabel={formatPhoneCountryLabel(selectedCountry)}
      triggerClassName={clsx(
        triggerClassName,
        error && "border-red-400 focus:border-red-500 focus:ring-red-100"
      )}
      triggerAriaLabel={ariaLabel}
    />
  );
}
