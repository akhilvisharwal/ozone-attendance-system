import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import { EmployeeRolesSettingsSection } from "@/components/settings/EmployeeRolesSettingsSection";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import type { EmployeeSettings, SecuritySettings } from "@/types/settings";
import { buildIdFormat, parseIdFormat } from "@/utils/employeeIdFormat";
import { notifyEmployeeCodesChanged } from "@/utils/employeeCodeEvents";
import { useAuth } from "@/auth/AuthContext";

type EmployeeFormState = {
  idPrefix: string;
  defaultPassword: string;
  requirePasswordChange: boolean;
  profilePhotoRequired: boolean;
  activeByDefault: boolean;
};

type FieldErrors = Partial<Record<keyof EmployeeFormState, string>>;

const DEFAULT_CONFIRM_MESSAGE = "Do you really want to save these changes?";
const PREFIX_CONFIRM_MESSAGE =
  "Changing the Employee ID Prefix will update all employee IDs across the system. Do you want to continue?";

function employeeToForm(employee: EmployeeSettings): EmployeeFormState {
  const { prefix } = parseIdFormat(employee.idFormat);
  return {
    idPrefix: prefix,
    defaultPassword: employee.defaultPassword,
    requirePasswordChange: employee.requirePasswordChange,
    profilePhotoRequired: employee.profilePhotoRequired,
    activeByDefault: employee.activeByDefault ?? true,
  };
}

function validatePasswordAgainstSecurity(
  password: string,
  security: SecuritySettings | null
): string | null {
  const trimmed = password.trim();
  if (!trimmed) return "Default password is required.";

  const minLength = security?.passwordMinLength ?? 8;
  if (trimmed.length < minLength) {
    return `Password must be at least ${minLength} characters (Security settings).`;
  }
  if (security?.requireUppercase && !/[A-Z]/.test(trimmed)) {
    return "Password must contain at least one uppercase letter (Security settings).";
  }
  if (security?.requireNumbers && !/[0-9]/.test(trimmed)) {
    return "Password must contain at least one number (Security settings).";
  }
  if (security?.requireSpecialCharacters && !/[^A-Za-z0-9]/.test(trimmed)) {
    return "Password must contain at least one special character (Security settings).";
  }
  return null;
}

function validateForm(form: EmployeeFormState, security: SecuritySettings | null): FieldErrors {
  const errors: FieldErrors = {};
  const prefix = form.idPrefix.trim().toUpperCase();

  if (!prefix) {
    errors.idPrefix = "Employee ID prefix is required.";
  } else if (!/^[A-Z0-9]{2,10}$/.test(prefix)) {
    errors.idPrefix = "Use 2–10 letters or numbers (e.g. OZN or EMP).";
  }

  const passwordError = validatePasswordAgainstSecurity(form.defaultPassword, security);
  if (passwordError) errors.defaultPassword = passwordError;

  return errors;
}

function buildPayload(base: EmployeeSettings, form: EmployeeFormState): EmployeeSettings {
  const { padLength } = parseIdFormat(base.idFormat);
  return {
    ...base,
    defaultDesignationId: base.defaultDesignationId ?? null,
    idFormat: buildIdFormat(form.idPrefix, padLength),
    defaultPassword: form.defaultPassword.trim(),
    requirePasswordChange: form.requirePasswordChange,
    profilePhotoRequired: form.profilePhotoRequired,
    activeByDefault: form.activeByDefault,
  };
}

function formsEqual(a: EmployeeFormState, b: EmployeeFormState): boolean {
  return (
    a.idPrefix.trim().toUpperCase() === b.idPrefix.trim().toUpperCase() &&
    a.defaultPassword === b.defaultPassword &&
    a.requirePasswordChange === b.requirePasswordChange &&
    a.profilePhotoRequired === b.profilePhotoRequired &&
    a.activeByDefault === b.activeByDefault
  );
}

export function EmployeeSettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const { refreshMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<EmployeeFormState | null>(null);
  const [savedForm, setSavedForm] = useState<EmployeeFormState | null>(null);
  const [baseEmployee, setBaseEmployee] = useState<EmployeeSettings | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);

  const loadEmployeeSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      const nextForm = employeeToForm(settings.employee);
      setBaseEmployee(settings.employee);
      setForm(nextForm);
      setSavedForm(nextForm);
      setSecurity(settings.security);
      setErrors({});
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load employee settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployeeSettings();
  }, [loadEmployeeSettings]);

  const previewId = useMemo(() => {
    if (!form) return "OZN001";
    const { padLength } = parseIdFormat(baseEmployee?.idFormat ?? "OZN###");
    const prefix = form.idPrefix.trim().toUpperCase() || "OZN";
    return `${prefix}${String(1).padStart(padLength, "0")}`;
  }, [form, baseEmployee?.idFormat]);

  const prefixChanging = useMemo(() => {
    if (!form || !savedForm) return false;
    return form.idPrefix.trim().toUpperCase() !== savedForm.idPrefix.trim().toUpperCase();
  }, [form, savedForm]);

  const isDirty = useMemo(() => {
    if (!form || !savedForm) return false;
    return !formsEqual(form, savedForm);
  }, [form, savedForm]);

  function updateField<K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleSaveClick() {
    if (!form || !baseEmployee) return;

    const nextErrors = validateForm(form, security);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!isDirty) {
      setMessage({ type: "success", text: "No changes to save." });
      return;
    }

    setConfirmOpen(true);
  }

  async function handleConfirmSave() {
    if (!form || !baseEmployee) return;

    setSaving(true);
    setMessage(null);
    try {
      // Re-fetch so defaultDesignationId from the Roles section is not overwritten,
      // and so we compare against the latest persisted idFormat from the database.
      const latest = await settingsApi.fetchSettings();
      const payload = buildPayload(latest.employee, form);
      const wasPrefixChange =
        parseIdFormat(latest.employee.idFormat).prefix !==
        parseIdFormat(payload.idFormat).prefix;

      const { employeeIdPrefixMigration } =
        await settingsApi.updateEmployeeSettings(payload);

      // Confirm from a fresh GET so the UI never trusts a stale response body.
      const confirmed = await settingsApi.fetchSettings();
      const nextForm = employeeToForm(confirmed.employee);
      setBaseEmployee(confirmed.employee);
      setForm(nextForm);
      setSavedForm(nextForm);
      await refresh();
      if (wasPrefixChange || (employeeIdPrefixMigration && employeeIdPrefixMigration.renamedCount > 0)) {
        await refreshMe();
        notifyEmployeeCodesChanged();
      }
      setConfirmOpen(false);

      const savedPrefix = parseIdFormat(confirmed.employee.idFormat).prefix;
      if (employeeIdPrefixMigration && employeeIdPrefixMigration.renamedCount > 0) {
        const conflictNote =
          employeeIdPrefixMigration.remappedDueToConflictCount &&
          employeeIdPrefixMigration.remappedDueToConflictCount > 0
            ? ` ${employeeIdPrefixMigration.remappedDueToConflictCount} ID${employeeIdPrefixMigration.remappedDueToConflictCount === 1 ? " was" : "s were"} remapped to the next free number because the preferred ID was already in use.`
            : "";
        setMessage({
          type: "success",
          text: `Employee ID prefix updated from ${employeeIdPrefixMigration.from} to ${employeeIdPrefixMigration.to}. ${employeeIdPrefixMigration.renamedCount} employee ID${employeeIdPrefixMigration.renamedCount === 1 ? "" : "s"} rewritten (numeric parts preserved).${conflictNote} New employees continue the sequence under ${employeeIdPrefixMigration.to}.`,
        });
      } else if (wasPrefixChange) {
        setMessage({
          type: "success",
          text: `Employee settings saved. Prefix is now ${savedPrefix}. Existing IDs that already used ${savedPrefix} were left unchanged.`,
        });
      } else {
        setMessage({ type: "success", text: "Employee settings saved successfully." });
      }

      showToast("Settings saved successfully.");

      // Guard: if the DB somehow still has the old prefix, surface it clearly.
      if (wasPrefixChange && savedPrefix !== form.idPrefix.trim().toUpperCase()) {
        setMessage({
          type: "error",
          text: `Prefix save did not persist. Expected ${form.idPrefix.trim().toUpperCase()} but database still has ${savedPrefix}.`,
        });
      }
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save employee settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading employee settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <EmployeeRolesSettingsSection />

      <SettingsSection
        title="New Employee Defaults"
        description="These values apply when creating employees. Changing the ID prefix also rewrites every existing employee ID (numeric part preserved)."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Employee ID Prefix"
            required
            value={form.idPrefix}
            onChange={(e) =>
              updateField("idPrefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            error={errors.idPrefix}
            hint={`IDs will look like ${previewId}. Changing the prefix updates all existing IDs (e.g. OZN001 → EMP001).`}
            maxLength={10}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="relative mt-4 max-w-md">
          <Input
            label="Default Password for New Employees"
            required
            type={showPassword ? "text" : "password"}
            value={form.defaultPassword}
            onChange={(e) => updateField("defaultPassword", e.target.value)}
            error={errors.defaultPassword}
            hint="Used as the initial login password when an employee is created. Must meet Security password rules."
            autoComplete="new-password"
          />
          <button
            type="button"
            className="absolute right-3 top-[2.125rem] text-slate-400 hover:text-slate-600"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Account Policies"
        description="Security and onboarding rules for newly created employee accounts."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Require Password Change on First Login"
            description="Employees must set a new password before accessing the app."
            checked={form.requirePasswordChange}
            onChange={(checked) => updateField("requirePasswordChange", checked)}
          />
          <ToggleRow
            label="Profile Photo Required"
            description="Employees must upload a profile photo before checking in."
            checked={form.profilePhotoRequired}
            onChange={(checked) => updateField("profilePhotoRequired", checked)}
          />
          <ToggleRow
            label="Employee Account Active by Default"
            description="When disabled, new accounts are created inactive until an admin activates them."
            checked={form.activeByDefault}
            onChange={(checked) => updateField("activeByDefault", checked)}
          />
        </div>
      </SettingsSection>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen} disabled={!isDirty && !saving}>
          Save changes
        </Button>
      </div>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        title={prefixChanging ? "Change Employee ID Prefix?" : "Save employee settings?"}
        message={prefixChanging ? PREFIX_CONFIRM_MESSAGE : DEFAULT_CONFIRM_MESSAGE}
        confirmLabel={prefixChanging ? "Continue" : "Save"}
        confirmVariant={prefixChanging ? "danger" : "primary"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
