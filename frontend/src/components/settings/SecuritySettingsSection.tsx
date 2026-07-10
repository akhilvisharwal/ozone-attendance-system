import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import {
  ADMIN_CONFIRM_PASSWORD_FIELD,
  ADMIN_CURRENT_PASSWORD_FIELD,
  ADMIN_NEW_PASSWORD_FIELD,
  blankCurrentPassword,
  clearPasswordFieldsAfterSuccess,
  emptyPasswordForm,
  validatePasswordForm,
  type PasswordFormState,
} from "@/components/settings/securityPasswordForm";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import { EmailOtpModal } from "@/components/EmailOtpModal";
import type { SecuritySettings } from "@/types/settings";

type SecurityFormState = SecuritySettings;

type FieldErrors = Partial<
  Record<
    "sessionTimeoutMinutes" | "loginAttemptLimit" | "passwordMinLength" | "passwordExpiryDays",
    string
  >
>;

const SECURITY_CONFIRM_MESSAGE =
  "Are you sure you want to save these security settings? They will take effect immediately.";

function securityToForm(security: SecuritySettings): SecurityFormState {
  return {
    sessionTimeoutMinutes: security.sessionTimeoutMinutes,
    loginAttemptLimit: security.loginAttemptLimit,
    passwordMinLength: security.passwordMinLength,
    requireUppercase: security.requireUppercase,
    requireNumbers: security.requireNumbers,
    requireSpecialCharacters: security.requireSpecialCharacters ?? false,
    passwordExpiryDays: security.passwordExpiryDays ?? 0,
    lockAccountAfterFailedAttempts: security.lockAccountAfterFailedAttempts ?? true,
    twoFactorEnabled: false,
  };
}

function validateSecurityForm(form: SecurityFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (form.sessionTimeoutMinutes < 5 || form.sessionTimeoutMinutes > 480) {
    errors.sessionTimeoutMinutes = "Enter a value between 5 and 480 minutes.";
  }
  if (form.loginAttemptLimit < 3 || form.loginAttemptLimit > 20) {
    errors.loginAttemptLimit = "Enter a value between 3 and 20 attempts.";
  }
  if (form.passwordMinLength < 6 || form.passwordMinLength > 128) {
    errors.passwordMinLength = "Enter a value between 6 and 128 characters.";
  }
  if (form.passwordExpiryDays < 0 || form.passwordExpiryDays > 365) {
    errors.passwordExpiryDays = "Enter a value between 0 and 365 days (0 disables expiry).";
  }
  return errors;
}

export function SecuritySettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<SecurityFormState | null>(null);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [passwordErrors, setPasswordErrors] = useState<Partial<Record<keyof PasswordFormState, string>>>({});
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      setForm(securityToForm(settings.security));
      setErrors({});
      setPasswordForm((prev) => blankCurrentPassword(prev));
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load security settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateField<K extends keyof SecurityFormState>(key: K, value: SecurityFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleSaveClick() {
    if (!form) return;
    const nextErrors = validateSecurityForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setConfirmOpen(true);
  }

  async function handleConfirmSave() {
    if (!form) return;

    setSaving(true);
    setMessage(null);
    try {
      const payload: SecuritySettings = { ...form, twoFactorEnabled: false };
      const updated = await settingsApi.updateSettingsCategory("security", payload);
      setForm(securityToForm(updated.security));
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Security settings saved successfully." });
      showToast("Settings saved successfully.");
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save security settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  function handleValidatePasswordForm(): Partial<Record<keyof PasswordFormState, string>> {
    return validatePasswordForm(passwordForm);
  }

  async function handleChangePassword() {
    const nextErrors = handleValidatePasswordForm();
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setOtpOpen(true);
  }

  async function handlePasswordOtpVerified(otp: { otpChallengeId: string; otpCode: string }) {
    setChangingPassword(true);
    setPasswordMessage(null);
    try {
      await settingsApi.changeAdminPassword({ ...passwordForm, ...otp });
      setPasswordForm(clearPasswordFieldsAfterSuccess());
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setOtpOpen(false);
      setPasswordMessage({ type: "success", text: "Admin password updated successfully." });
      showToast("Admin password updated.");
    } catch (err) {
      throw err;
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading security settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <SettingsSection
        title="Session & Access"
        description="Control how long sessions remain active and how failed logins are handled."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Session Timeout"
            type="number"
            min={5}
            max={480}
            step={1}
            required
            value={form.sessionTimeoutMinutes}
            onChange={(e) => updateField("sessionTimeoutMinutes", Number(e.target.value))}
            error={errors.sessionTimeoutMinutes}
            hint="Minutes of inactivity before a session expires. Users see a warning 2 minutes before automatic logout."
          />
          <Input
            label="Maximum Login Attempts"
            type="number"
            min={3}
            max={20}
            step={1}
            required
            value={form.loginAttemptLimit}
            onChange={(e) => updateField("loginAttemptLimit", Number(e.target.value))}
            error={errors.loginAttemptLimit}
            hint="Failed attempts allowed before lockout or rejection."
          />
        </div>

        <div className="mt-4 space-y-3">
          <ToggleRow
            label="Lock Account After Failed Attempts"
            description="When enabled, accounts are temporarily locked after exceeding the maximum login attempts."
            checked={form.lockAccountAfterFailedAttempts}
            onChange={(checked) => updateField("lockAccountAfterFailedAttempts", checked)}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Password Policy"
        description="Rules applied when admins or employees set a new password."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Minimum Password Length"
            type="number"
            min={6}
            max={128}
            step={1}
            required
            value={form.passwordMinLength}
            onChange={(e) => updateField("passwordMinLength", Number(e.target.value))}
            error={errors.passwordMinLength}
          />
          <Input
            label="Force Password Change Every (Days)"
            type="number"
            min={0}
            max={365}
            step={1}
            required
            value={form.passwordExpiryDays}
            onChange={(e) => updateField("passwordExpiryDays", Number(e.target.value))}
            error={errors.passwordExpiryDays}
            hint="Set to 0 to disable forced password rotation."
          />
        </div>

        <div className="mt-4 space-y-3">
          <ToggleRow
            label="Require Uppercase Letters"
            checked={form.requireUppercase}
            onChange={(checked) => updateField("requireUppercase", checked)}
          />
          <ToggleRow
            label="Require Numbers"
            checked={form.requireNumbers}
            onChange={(checked) => updateField("requireNumbers", checked)}
          />
          <ToggleRow
            label="Require Special Characters"
            checked={form.requireSpecialCharacters}
            onChange={(checked) => updateField("requireSpecialCharacters", checked)}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Advanced Security"
        description="Additional authentication controls."
      >
        <ToggleRow
          label="Two-Factor Authentication"
          description="Coming soon — additional verification will be required at sign-in."
          checked={false}
          onChange={() => undefined}
          disabled
        />
      </SettingsSection>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen}>
          Save changes
        </Button>
      </div>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        title="Save security settings?"
        message={SECURITY_CONFIRM_MESSAGE}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />

      <SettingsSection
        title="Change Admin Password"
        description="Update the password for your administrator account."
      >
        {passwordMessage && (
          <div className="mb-4">
            <Alert variant={passwordMessage.type === "error" ? "error" : "success"}>
              {passwordMessage.text}
            </Alert>
          </div>
        )}

        <form
          autoComplete="off"
          className="max-w-md space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleChangePassword();
          }}
        >
          <div className="relative">
            <Input
              label="Current Password"
              required
              type={showCurrentPassword ? "text" : "password"}
              value={passwordForm.currentPassword}
              onChange={(e) => {
                setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }));
                setPasswordErrors((prev) => ({ ...prev, currentPassword: undefined }));
              }}
              onFocus={(e) => {
                e.currentTarget.readOnly = false;
              }}
              readOnly
              error={passwordErrors.currentPassword}
              {...ADMIN_CURRENT_PASSWORD_FIELD}
            />
            <button
              type="button"
              className="absolute right-3 top-[2.125rem] text-slate-400 hover:text-slate-600"
              onClick={() => setShowCurrentPassword((prev) => !prev)}
              aria-label={showCurrentPassword ? "Hide password" : "Show password"}
            >
              {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="relative">
            <Input
              label="New Password"
              required
              type={showNewPassword ? "text" : "password"}
              value={passwordForm.newPassword}
              onChange={(e) => {
                setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }));
                setPasswordErrors((prev) => ({ ...prev, newPassword: undefined }));
              }}
              error={passwordErrors.newPassword}
              {...ADMIN_NEW_PASSWORD_FIELD}
            />
            <button
              type="button"
              className="absolute right-3 top-[2.125rem] text-slate-400 hover:text-slate-600"
              onClick={() => setShowNewPassword((prev) => !prev)}
              aria-label={showNewPassword ? "Hide password" : "Show password"}
            >
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <Input
            label="Confirm New Password"
            required
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => {
              setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }));
              setPasswordErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            }}
            error={passwordErrors.confirmPassword}
            {...ADMIN_CONFIRM_PASSWORD_FIELD}
          />

          <Button
            type="submit"
            isLoading={changingPassword}
            icon={<ShieldCheck className="h-4 w-4" />}
          >
            Update admin password
          </Button>
        </form>
      </SettingsSection>

      <EmailOtpModal
        open={otpOpen}
        purpose="admin_password_change"
        onClose={() => setOtpOpen(false)}
        onVerified={handlePasswordOtpVerified}
      />
    </div>
  );
}
