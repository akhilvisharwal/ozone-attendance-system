import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import type { MobileSettings } from "@/types/settings";

type CaptureFormState = MobileSettings;

type FieldErrors = {
  gpsAccuracyThresholdMeters?: string;
};

function captureToForm(mobile: MobileSettings): CaptureFormState {
  return {
    gpsRequiredCheckIn: mobile.gpsRequiredCheckIn,
    gpsRequiredCheckOut: mobile.gpsRequiredCheckOut,
    selfieRequiredCheckIn: mobile.selfieRequiredCheckIn,
    selfieRequiredCheckOut: mobile.selfieRequiredCheckOut,
    allowCameraSwitch: mobile.allowCameraSwitch,
    gpsAccuracyThresholdMeters: mobile.gpsAccuracyThresholdMeters,
    allowOfflineMode: mobile.allowOfflineMode ?? false,
    allowDesktopCheckIn: mobile.allowDesktopCheckIn ?? true,
  };
}

function validateForm(form: CaptureFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (form.gpsAccuracyThresholdMeters < 10 || form.gpsAccuracyThresholdMeters > 5000) {
    errors.gpsAccuracyThresholdMeters = "Enter a value between 10 and 5000 meters.";
  }
  return errors;
}

export function AttendanceCaptureSettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<CaptureFormState | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      setForm(captureToForm(settings.mobile));
      setErrors({});
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load attendance capture settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateField<K extends keyof CaptureFormState>(key: K, value: CaptureFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleSaveClick() {
    if (!form) return;

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setConfirmOpen(true);
  }

  async function handleConfirmSave() {
    if (!form) return;

    setSaving(true);
    setMessage(null);
    try {
      const updated = await settingsApi.updateSettingsCategory("mobile", form);
      setForm(captureToForm(updated.mobile));
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Attendance capture settings saved successfully." });
      showToast("Settings saved successfully.");
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save attendance capture settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading attendance capture settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <SettingsSection
        title="Location & Identity"
        description="Control whether GPS and live selfies are required when employees check in or out."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Require GPS for Check-In"
            description="Employees must share their location when checking in."
            checked={form.gpsRequiredCheckIn}
            onChange={(checked) => updateField("gpsRequiredCheckIn", checked)}
          />
          <ToggleRow
            label="Require GPS for Check-Out"
            description="Employees must share their location when checking out."
            checked={form.gpsRequiredCheckOut}
            onChange={(checked) => updateField("gpsRequiredCheckOut", checked)}
          />
          <ToggleRow
            label="Require Selfie for Check-In"
            description="Employees must capture a live selfie from the camera when checking in."
            checked={form.selfieRequiredCheckIn}
            onChange={(checked) => updateField("selfieRequiredCheckIn", checked)}
          />
          <ToggleRow
            label="Require Selfie for Check-Out"
            description="Employees must capture a live selfie from the camera when checking out."
            checked={form.selfieRequiredCheckOut}
            onChange={(checked) => updateField("selfieRequiredCheckOut", checked)}
          />
          <ToggleRow
            label="Allow Camera Switching"
            description="Let employees switch between front and rear cameras during selfie capture."
            checked={form.allowCameraSwitch}
            onChange={(checked) => updateField("allowCameraSwitch", checked)}
          />
        </div>

        <div className="mt-4 max-w-xs">
          <Input
            label="Maximum GPS Accuracy"
            type="number"
            min={10}
            max={5000}
            step={1}
            required
            value={form.gpsAccuracyThresholdMeters}
            onChange={(e) => updateField("gpsAccuracyThresholdMeters", Number(e.target.value))}
            error={errors.gpsAccuracyThresholdMeters}
            hint="Maximum allowed GPS accuracy in meters. Lower values require more precise location."
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Access & Connectivity"
        description="Rules for where and how attendance can be captured across devices."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Allow Attendance Without Internet (Offline Mode)"
            description="When enabled, employees can queue check-in or check-out while offline and sync when connectivity returns."
            checked={form.allowOfflineMode}
            onChange={(checked) => updateField("allowOfflineMode", checked)}
          />
          <ToggleRow
            label="Allow Desktop/Web Check-In"
            description="When disabled, employees must use a mobile device to check in or out."
            checked={form.allowDesktopCheckIn}
            onChange={(checked) => updateField("allowDesktopCheckIn", checked)}
          />
        </div>
      </SettingsSection>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen}>
          Save changes
        </Button>
      </div>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        title="Save attendance capture settings?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
