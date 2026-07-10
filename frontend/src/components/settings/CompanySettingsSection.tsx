import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { PhoneNumberField } from "@/components/settings/PhoneNumberField";
import { CompanySaveConfirmModal } from "@/components/settings/CompanySaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import { EmailOtpModal } from "@/components/EmailOtpModal";
import type { OtpPurpose } from "@/api/emailVerification";
import type { CompanySettings } from "@/types/settings";
import {
  DEFAULT_PHONE_DIAL_CODE,
  sanitizeNationalPhoneNumber,
  splitPhoneNumber,
} from "@/constants/phoneCountries";

const FIXED_COMPANY_NAME = "Ozone Aircon";

type CompanyFormState = Pick<
  CompanySettings,
  | "address"
  | "phone"
  | "phoneCountryCode"
  | "secondaryPhone"
  | "secondaryPhoneCountryCode"
  | "email"
  | "additionalEmails"
>;

type FieldErrors = Partial<Record<keyof CompanyFormState | "additionalEmails", string>>;

function emptyForm(): CompanyFormState {
  return {
    address: "",
    phone: "",
    phoneCountryCode: DEFAULT_PHONE_DIAL_CODE,
    secondaryPhone: "",
    secondaryPhoneCountryCode: DEFAULT_PHONE_DIAL_CODE,
    email: "",
    additionalEmails: [],
  };
}

function companyToForm(company: CompanySettings): CompanyFormState {
  const primary = company.phone?.trim().startsWith("+")
    ? splitPhoneNumber(company.phone, company.phoneCountryCode || DEFAULT_PHONE_DIAL_CODE)
    : {
        dialCode: company.phoneCountryCode || DEFAULT_PHONE_DIAL_CODE,
        nationalNumber: company.phone ?? "",
      };

  const secondary = company.secondaryPhone?.trim().startsWith("+")
    ? splitPhoneNumber(company.secondaryPhone, company.secondaryPhoneCountryCode || DEFAULT_PHONE_DIAL_CODE)
    : {
        dialCode: company.secondaryPhoneCountryCode || DEFAULT_PHONE_DIAL_CODE,
        nationalNumber: company.secondaryPhone ?? "",
      };

  return {
    address: company.address ?? "",
    phone: primary.nationalNumber,
    phoneCountryCode: primary.dialCode,
    secondaryPhone: secondary.nationalNumber,
    secondaryPhoneCountryCode: secondary.dialCode,
    email: company.email ?? "",
    additionalEmails: [...(company.additionalEmails ?? [])],
  };
}

function validateForm(form: CompanyFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.phone.trim()) {
    errors.phone = "Primary contact number is required.";
  }
  if (!form.email.trim()) {
    errors.email = "Primary email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Enter a valid primary email address.";
  }

  const primaryEmail = form.email.trim().toLowerCase();
  const invalidAdditional = form.additionalEmails.findIndex(
    (value) => value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
  if (invalidAdditional >= 0) {
    errors.additionalEmails = `Additional email ${invalidAdditional + 1} is invalid.`;
  }

  const duplicateAdditional = form.additionalEmails.findIndex(
    (value) => value.trim().toLowerCase() === primaryEmail && primaryEmail.length > 0
  );
  if (duplicateAdditional >= 0) {
    errors.additionalEmails = "Additional emails must be different from the primary email.";
  }

  return errors;
}

export function CompanySettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CompanySettings | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<CompanyFormState>(emptyForm);
  const [baseCompany, setBaseCompany] = useState<CompanySettings | null>(null);

  const loadCompanySettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      const company = settings.company;
      setBaseCompany(company);
      setForm(companyToForm(company));
      setErrors({});
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load company settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanySettings();
  }, [loadCompanySettings]);

  function updateField<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, additionalEmails: undefined }));
  }

  function addEmailField() {
    setForm((prev) => ({ ...prev, additionalEmails: [...prev.additionalEmails, ""] }));
  }

  function updateAdditionalEmail(index: number, value: string) {
    setForm((prev) => ({
      ...prev,
      additionalEmails: prev.additionalEmails.map((email, i) => (i === index ? value : email)),
    }));
    setErrors((prev) => ({ ...prev, additionalEmails: undefined }));
  }

  function removeAdditionalEmail(index: number) {
    setForm((prev) => ({
      ...prev,
      additionalEmails: prev.additionalEmails.filter((_, i) => i !== index),
    }));
    setErrors((prev) => ({ ...prev, additionalEmails: undefined }));
  }

  function handleSaveClick() {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setConfirmOpen(true);
  }

  async function handleConfirmSave() {
    if (!baseCompany) return;

    const payload: CompanySettings = {
      ...baseCompany,
      name: FIXED_COMPANY_NAME,
      address: form.address.trim(),
      phoneCountryCode: form.phoneCountryCode,
      phone: sanitizeNationalPhoneNumber(form.phone),
      secondaryPhoneCountryCode: form.secondaryPhoneCountryCode,
      secondaryPhone: sanitizeNationalPhoneNumber(form.secondaryPhone),
      email: form.email.trim(),
      additionalEmails: form.additionalEmails.map((value) => value.trim()).filter(Boolean),
    };

    const emailChanged =
      baseCompany.email.trim().toLowerCase() !== payload.email.trim().toLowerCase();
    const phoneChanged =
      baseCompany.phone.trim() !== payload.phone.trim() ||
      baseCompany.phoneCountryCode !== payload.phoneCountryCode;

    setConfirmOpen(false);

    if (emailChanged) {
      setPendingPayload(payload);
      setOtpPurpose("company_email_change");
      return;
    }
    if (phoneChanged) {
      setPendingPayload(payload);
      setOtpPurpose("company_phone_change");
      return;
    }

    await saveCompanyPayload(payload);
  }

  async function saveCompanyPayload(
    payload: CompanySettings,
    otp?: { otpChallengeId: string; otpCode: string }
  ) {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await settingsApi.updateSettingsCategory("company", payload, otp);
      setBaseCompany(updated.company);
      setForm(companyToForm(updated.company));
      await refresh();
      setOtpPurpose(null);
      setPendingPayload(null);
      setMessage({ type: "success", text: "Company information updated successfully." });
      showToast("Settings saved successfully.");
    } catch (err) {
      if (otp) throw err;
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save company information."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCompanyOtpVerified(otp: { otpChallengeId: string; otpCode: string }) {
    if (!pendingPayload) return;
    await saveCompanyPayload(pendingPayload, otp);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading company information…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Company Information</h3>
          <p className="mt-1 text-sm text-slate-500">
            Organization details used across reports, PDFs, headers, and contact information.
          </p>
        </div>

        <Input
          label="Company Name"
          value={FIXED_COMPANY_NAME}
          readOnly
          disabled
          hint="Company name is fixed and cannot be changed."
        />

        <Textarea
          label="Company Address"
          rows={3}
          value={form.address}
          onChange={(e) => updateField("address", e.target.value)}
          placeholder="Enter company address"
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PhoneNumberField
            label="Primary Contact Number"
            required
            dialCode={form.phoneCountryCode}
            nationalNumber={form.phone}
            onDialCodeChange={(dialCode) => updateField("phoneCountryCode", dialCode)}
            onNationalNumberChange={(phone) => updateField("phone", phone)}
            error={errors.phone}
            placeholder="98765 43210"
          />
          <PhoneNumberField
            label="Secondary Contact Number"
            dialCode={form.secondaryPhoneCountryCode}
            nationalNumber={form.secondaryPhone}
            onDialCodeChange={(dialCode) => updateField("secondaryPhoneCountryCode", dialCode)}
            onNationalNumberChange={(secondaryPhone) => updateField("secondaryPhone", secondaryPhone)}
            hint="Optional backup contact number"
            placeholder="Optional"
          />
        </div>
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Email Addresses</h3>
          <p className="mt-1 text-sm text-slate-500">
            Primary email is required. Add additional addresses for notifications and contact display.
          </p>
        </div>

        <Input
          label="Primary Email"
          required
          type="email"
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
          error={errors.email}
          placeholder="admin@ozoneaircon.com"
        />

        {form.additionalEmails.length > 0 && (
          <div className="space-y-3">
            {form.additionalEmails.map((email, index) => (
              <div key={`additional-email-${index}`} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    label={`Additional Email ${index + 1}`}
                    type="email"
                    value={email}
                    onChange={(e) => updateAdditionalEmail(index, e.target.value)}
                    placeholder="Optional email address"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mb-0.5 shrink-0"
                  onClick={() => removeAdditionalEmail(index)}
                  icon={<Trash2 className="h-4 w-4" />}
                  aria-label={`Remove additional email ${index + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {errors.additionalEmails && (
          <p className="text-xs text-red-600">{errors.additionalEmails}</p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addEmailField}
          icon={<Plus className="h-4 w-4" />}
        >
          Add Email
        </Button>
      </section>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen}>
          Save changes
        </Button>
      </div>

      <CompanySaveConfirmModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />

      <EmailOtpModal
        open={Boolean(otpPurpose)}
        purpose={otpPurpose}
        onClose={() => {
          setOtpPurpose(null);
          setPendingPayload(null);
        }}
        onVerified={handleCompanyOtpVerified}
      />
    </div>
  );
}
