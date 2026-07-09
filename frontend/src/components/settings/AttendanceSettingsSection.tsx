import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { TimeSlotCombobox } from "@/components/ui/TimeSlotCombobox";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { AttendanceSaveConfirmModal } from "@/components/settings/AttendanceSaveConfirmModal";
import { AttendanceDailyOverridesSection } from "@/components/settings/AttendanceDailyOverridesSection";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import type { AttendanceSettings } from "@/types/settings";

type AttendanceFormState = Pick<
  AttendanceSettings,
  | "officeStartTime"
  | "lateCheckInTime"
  | "officeClosingTime"
  | "halfDayCutoff"
  | "minHoursPresent"
  | "minHoursHalfDay"
  | "autoCalculate"
  | "allowManualOverride"
  | "allowMultipleCheckIns"
>;

type FieldErrors = Partial<Record<keyof AttendanceFormState, string>>;

function attendanceToForm(attendance: AttendanceSettings): AttendanceFormState {
  return {
    officeStartTime: attendance.officeStartTime,
    lateCheckInTime: attendance.lateCheckInTime,
    officeClosingTime: attendance.officeClosingTime,
    halfDayCutoff: attendance.halfDayCutoff,
    minHoursPresent: attendance.minHoursPresent,
    minHoursHalfDay: attendance.minHoursHalfDay,
    autoCalculate: attendance.autoCalculate,
    allowManualOverride: attendance.allowManualOverride,
    allowMultipleCheckIns: attendance.allowMultipleCheckIns,
  };
}

function validateForm(form: AttendanceFormState): FieldErrors {
  const errors: FieldErrors = {};

  if (form.officeStartTime > form.lateCheckInTime) {
    errors.lateCheckInTime = "Must be at or after office start time.";
  }
  if (form.lateCheckInTime > form.halfDayCutoff) {
    errors.halfDayCutoff = "Must be at or after late check-in time.";
  }
  if (form.halfDayCutoff > form.officeClosingTime) {
    errors.officeClosingTime = "Must be at or after half-day cutoff.";
  }
  if (form.minHoursHalfDay >= form.minHoursPresent) {
    errors.minHoursHalfDay = "Must be less than minimum hours for present.";
  }
  if (form.minHoursPresent < 1 || form.minHoursPresent > 24) {
    errors.minHoursPresent = "Enter a value between 1 and 24 hours.";
  }
  if (form.minHoursHalfDay < 0.5 || form.minHoursHalfDay > 12) {
    errors.minHoursHalfDay = "Enter a value between 0.5 and 12 hours.";
  }

  return errors;
}

function buildPayload(base: AttendanceSettings, form: AttendanceFormState): AttendanceSettings {
  return {
    ...base,
    ...form,
    checkinOpenTime: form.officeStartTime,
    checkinOntimeEnd: form.lateCheckInTime,
  };
}

export function AttendanceSettingsSection() {
  const { refresh } = useSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<AttendanceFormState | null>(null);
  const [baseAttendance, setBaseAttendance] = useState<AttendanceSettings | null>(null);

  const loadAttendanceSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      setBaseAttendance(settings.attendance);
      setForm(attendanceToForm(settings.attendance));
      setErrors({});
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load attendance settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAttendanceSettings();
  }, [loadAttendanceSettings]);

  function updateField<K extends keyof AttendanceFormState>(key: K, value: AttendanceFormState[K]) {
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
    if (!form || !baseAttendance) return;

    setSaving(true);
    setMessage(null);
    try {
      const payload = buildPayload(baseAttendance, form);
      const updated = await settingsApi.updateSettingsCategory("attendance", payload);
      setBaseAttendance(updated.attendance);
      setForm(attendanceToForm(updated.attendance));
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Attendance settings updated successfully." });
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save attendance settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading attendance settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <SettingsSection
        title="Default Rules"
        description="Standard attendance policy applied to every working day unless a daily override is active."
      >
        <div className="space-y-8">
      <SettingsSection
        title="Office Hours"
        description="Define when the workday starts, when check-ins are considered late, and when the office closes."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TimeSlotCombobox
            label="Office Start Time"
            required
            value={form.officeStartTime}
            onChange={(value) => updateField("officeStartTime", value)}
            hint="Earliest expected check-in time."
          />
          <TimeSlotCombobox
            label="Late Check-In After"
            required
            value={form.lateCheckInTime}
            onChange={(value) => updateField("lateCheckInTime", value)}
            error={errors.lateCheckInTime}
            hint="Check-ins after this time are marked late."
          />
          <TimeSlotCombobox
            label="Half-Day Cutoff"
            required
            value={form.halfDayCutoff}
            onChange={(value) => updateField("halfDayCutoff", value)}
            error={errors.halfDayCutoff}
            hint="Check-ins after this time are treated as half-day."
          />
          <TimeSlotCombobox
            label="Office Closing Time"
            required
            value={form.officeClosingTime}
            onChange={(value) => updateField("officeClosingTime", value)}
            error={errors.officeClosingTime}
            hint="Standard end of the workday for check-out classification."
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Hours-Based Attendance"
        description="Minimum worked hours used to determine present, half-day, and absent status when automatic calculation is enabled."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Minimum Hours for Present"
            type="number"
            min={1}
            max={24}
            step={0.5}
            required
            value={form.minHoursPresent}
            onChange={(e) => updateField("minHoursPresent", Number(e.target.value))}
            error={errors.minHoursPresent}
          />
          <Input
            label="Minimum Hours for Half Day"
            type="number"
            min={0.5}
            max={12}
            step={0.5}
            required
            value={form.minHoursHalfDay}
            onChange={(e) => updateField("minHoursHalfDay", Number(e.target.value))}
            error={errors.minHoursHalfDay}
          />
        </div>
      </SettingsSection>

      <AttendanceDailyOverridesSection defaultRules={baseAttendance} />

      <SettingsSection
        title="Policies"
        description="Control how attendance is calculated and whether administrators can override records."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Automatic Attendance Calculation"
            description="When enabled, present/half-day/absent status is calculated from total worked hours at check-out."
            checked={form.autoCalculate}
            onChange={(checked) => updateField("autoCalculate", checked)}
          />
          <ToggleRow
            label="Manual Attendance Override"
            description="Allow administrators to mark employees present, half-day, or absent from the Employees page."
            checked={form.allowManualOverride}
            onChange={(checked) => updateField("allowManualOverride", checked)}
          />
          <ToggleRow
            label="Allow Multiple Check-Ins"
            description="Allow employees to check in again after checking out on the same day. Worked minutes accumulate across sessions."
            checked={form.allowMultipleCheckIns}
            onChange={(checked) => updateField("allowMultipleCheckIns", checked)}
          />
        </div>
      </SettingsSection>
        </div>
      </SettingsSection>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen}>
          Save changes
        </Button>
      </div>

      <AttendanceSaveConfirmModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
