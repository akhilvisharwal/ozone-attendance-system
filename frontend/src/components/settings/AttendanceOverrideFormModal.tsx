import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, FieldWrapper } from "@/components/ui/Input";
import { TimeSlotCombobox } from "@/components/ui/TimeSlotCombobox";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmployeeMultiSelect } from "@/components/EmployeeMultiSelect";
import * as overridesApi from "@/api/attendanceOverrides";
import { extractErrorMessage } from "@/api/client";
import {
  ATTENDANCE_OVERRIDE_REASON_PRESETS,
  type AttendanceDailyOverride,
  type AttendanceSettings,
} from "@/types/settings";

type RuleKey =
  | "officeStartTime"
  | "lateCheckInTime"
  | "halfDayCutoff"
  | "officeClosingTime"
  | "minHoursPresent"
  | "minHoursHalfDay";

interface FormState {
  startDate: string;
  endDate: string;
  reasonPreset: string;
  customReason: string;
  applyToAll: boolean;
  employeeIds: string[];
  enabled: Record<RuleKey, boolean>;
  officeStartTime: string;
  lateCheckInTime: string;
  halfDayCutoff: string;
  officeClosingTime: string;
  minHoursPresent: number;
  minHoursHalfDay: number;
}

function emptyForm(defaults: AttendanceSettings): FormState {
  return {
    startDate: "",
    endDate: "",
    reasonPreset: ATTENDANCE_OVERRIDE_REASON_PRESETS[0],
    customReason: "",
    applyToAll: true,
    employeeIds: [],
    enabled: {
      officeStartTime: false,
      lateCheckInTime: false,
      halfDayCutoff: false,
      officeClosingTime: false,
      minHoursPresent: false,
      minHoursHalfDay: false,
    },
    officeStartTime: defaults.officeStartTime,
    lateCheckInTime: defaults.lateCheckInTime,
    halfDayCutoff: defaults.halfDayCutoff,
    officeClosingTime: defaults.officeClosingTime,
    minHoursPresent: defaults.minHoursPresent,
    minHoursHalfDay: defaults.minHoursHalfDay,
  };
}

function formFromOverride(
  defaults: AttendanceSettings,
  override: AttendanceDailyOverride,
  duplicate = false
): FormState {
  const preset = ATTENDANCE_OVERRIDE_REASON_PRESETS.includes(
    override.reason as (typeof ATTENDANCE_OVERRIDE_REASON_PRESETS)[number]
  )
    ? override.reason
    : "Custom";

  return {
    startDate: duplicate ? "" : override.startDate,
    endDate: duplicate ? "" : override.endDate,
    reasonPreset: duplicate ? preset : preset,
    customReason: preset === "Custom" ? override.reason : duplicate ? `${override.reason} (Copy)` : "",
    applyToAll: override.applyToAll,
    employeeIds: override.applyToAll ? [] : override.employees.map((e) => e.id),
    enabled: {
      officeStartTime: override.officeStartTime != null,
      lateCheckInTime: override.lateCheckInTime != null,
      halfDayCutoff: override.halfDayCutoff != null,
      officeClosingTime: override.officeClosingTime != null,
      minHoursPresent: override.minHoursPresent != null,
      minHoursHalfDay: override.minHoursHalfDay != null,
    },
    officeStartTime: override.officeStartTime ?? defaults.officeStartTime,
    lateCheckInTime: override.lateCheckInTime ?? defaults.lateCheckInTime,
    halfDayCutoff: override.halfDayCutoff ?? defaults.halfDayCutoff,
    officeClosingTime: override.officeClosingTime ?? defaults.officeClosingTime,
    minHoursPresent: override.minHoursPresent ?? defaults.minHoursPresent,
    minHoursHalfDay: override.minHoursHalfDay ?? defaults.minHoursHalfDay,
  };
}

function buildPayload(form: FormState): overridesApi.AttendanceOverrideInput {
  const reason =
    form.reasonPreset === "Custom" ? form.customReason.trim() : form.reasonPreset;

  return {
    startDate: form.startDate,
    endDate: form.endDate,
    reason,
    applyToAll: form.applyToAll,
    employeeIds: form.applyToAll ? [] : form.employeeIds,
    officeStartTime: form.enabled.officeStartTime ? form.officeStartTime : null,
    lateCheckInTime: form.enabled.lateCheckInTime ? form.lateCheckInTime : null,
    halfDayCutoff: form.enabled.halfDayCutoff ? form.halfDayCutoff : null,
    officeClosingTime: form.enabled.officeClosingTime ? form.officeClosingTime : null,
    minHoursPresent: form.enabled.minHoursPresent ? form.minHoursPresent : null,
    minHoursHalfDay: form.enabled.minHoursHalfDay ? form.minHoursHalfDay : null,
  };
}

function validateForm(form: FormState): string | null {
  if (!form.startDate || !form.endDate) return "Start and end dates are required.";
  if (form.startDate > form.endDate) return "End date must be on or after start date.";
  const reason =
    form.reasonPreset === "Custom" ? form.customReason.trim() : form.reasonPreset;
  if (!reason) return "Reason is required.";
  if (!form.applyToAll && form.employeeIds.length === 0) {
    return "Select at least one employee or apply to all employees.";
  }
  if (!Object.values(form.enabled).some(Boolean)) {
    return "Enable at least one rule to override.";
  }
  if (form.enabled.minHoursHalfDay && form.enabled.minHoursPresent && form.minHoursHalfDay >= form.minHoursPresent) {
    return "Half-day hours must be less than present hours.";
  }
  return null;
}

function RuleToggleRow({
  label,
  description,
  checked,
  onToggle,
  children,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900">{label}</span>
          {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
          {checked && <div className="mt-3">{children}</div>}
        </span>
      </label>
    </div>
  );
}

export function AttendanceOverrideFormModal({
  open,
  defaultRules,
  initial,
  duplicateFrom,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaultRules: AttendanceSettings;
  initial: AttendanceDailyOverride | null;
  duplicateFrom?: AttendanceDailyOverride | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultRules));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm(formFromOverride(defaultRules, initial));
    } else if (duplicateFrom) {
      setForm(formFromOverride(defaultRules, duplicateFrom, true));
    } else {
      setForm(emptyForm(defaultRules));
    }
    setError(null);
  }, [open, initial, duplicateFrom, defaultRules]);

  const title = useMemo(() => {
    if (initial) return "Edit daily override";
    if (duplicateFrom) return "Duplicate daily override";
    return "Add daily override";
  }, [initial, duplicateFrom]);

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setError(null);
  }

  function toggleRule(key: RuleKey, enabled: boolean) {
    setForm((prev) => ({
      ...prev,
      enabled: { ...prev.enabled, [key]: enabled },
    }));
    setError(null);
  }

  async function handleSubmit() {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload(form);
      if (initial) {
        await overridesApi.updateAttendanceOverride(initial.id, payload);
      } else {
        await overridesApi.createAttendanceOverride(payload);
      }
      await onSaved();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save override."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} widthClassName="max-w-2xl">
      <div className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Start date"
            type="date"
            required
            value={form.startDate}
            onChange={(e) => updateForm({ startDate: e.target.value, endDate: form.endDate || e.target.value })}
          />
          <Input
            label="End date"
            type="date"
            required
            value={form.endDate}
            onChange={(e) => updateForm({ endDate: e.target.value })}
          />
        </div>

        <FieldWrapper label="Reason" required>
          <Select
            value={form.reasonPreset}
            onChange={(e) => updateForm({ reasonPreset: e.target.value })}
          >
            {ATTENDANCE_OVERRIDE_REASON_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
            <option value="Custom">Custom…</option>
          </Select>
        </FieldWrapper>

        {form.reasonPreset === "Custom" && (
          <Input
            label="Custom reason"
            required
            value={form.customReason}
            onChange={(e) => updateForm({ customReason: e.target.value })}
            placeholder="Describe why rules are relaxed"
          />
        )}

        <FieldWrapper label="Employee assignment" required>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="assignmentScope"
                checked={form.applyToAll}
                onChange={() => updateForm({ applyToAll: true, employeeIds: [] })}
              />
              Apply to all employees
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="assignmentScope"
                checked={!form.applyToAll}
                onChange={() => updateForm({ applyToAll: false })}
              />
              Apply to selected employees
            </label>
          </div>
        </FieldWrapper>

        {!form.applyToAll && (
          <EmployeeMultiSelect
            selectedIds={form.employeeIds}
            onChange={(employeeIds) => updateForm({ employeeIds })}
          />
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-900">Rules to relax for these dates</p>
          <p className="text-xs text-slate-500">
            Check each rule you want to change. Unchecked rules keep the default policy.
          </p>

          <RuleToggleRow
            label="Minimum hours for Present"
            description={`Default: ${defaultRules.minHoursPresent}h`}
            checked={form.enabled.minHoursPresent}
            onToggle={(checked) => toggleRule("minHoursPresent", checked)}
          >
            <Input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={form.minHoursPresent}
              onChange={(e) => updateForm({ minHoursPresent: Number(e.target.value) })}
            />
          </RuleToggleRow>

          <RuleToggleRow
            label="Minimum hours for Half Day"
            description={`Default: ${defaultRules.minHoursHalfDay}h`}
            checked={form.enabled.minHoursHalfDay}
            onToggle={(checked) => toggleRule("minHoursHalfDay", checked)}
          >
            <Input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={form.minHoursHalfDay}
              onChange={(e) => updateForm({ minHoursHalfDay: Number(e.target.value) })}
            />
          </RuleToggleRow>

          <RuleToggleRow
            label="Late check-in after"
            description={`Default: ${defaultRules.lateCheckInTime}`}
            checked={form.enabled.lateCheckInTime}
            onToggle={(checked) => toggleRule("lateCheckInTime", checked)}
          >
            <TimeSlotCombobox
              value={form.lateCheckInTime}
              onChange={(value) => updateForm({ lateCheckInTime: value })}
            />
          </RuleToggleRow>

          <RuleToggleRow
            label="Half-day cutoff"
            description={`Default: ${defaultRules.halfDayCutoff}`}
            checked={form.enabled.halfDayCutoff}
            onToggle={(checked) => toggleRule("halfDayCutoff", checked)}
          >
            <TimeSlotCombobox
              value={form.halfDayCutoff}
              onChange={(value) => updateForm({ halfDayCutoff: value })}
            />
          </RuleToggleRow>

          <RuleToggleRow
            label="Office start time"
            description={`Default: ${defaultRules.officeStartTime}`}
            checked={form.enabled.officeStartTime}
            onToggle={(checked) => toggleRule("officeStartTime", checked)}
          >
            <TimeSlotCombobox
              value={form.officeStartTime}
              onChange={(value) => updateForm({ officeStartTime: value })}
            />
          </RuleToggleRow>

          <RuleToggleRow
            label="Office closing time"
            description={`Default: ${defaultRules.officeClosingTime}`}
            checked={form.enabled.officeClosingTime}
            onToggle={(checked) => toggleRule("officeClosingTime", checked)}
          >
            <TimeSlotCombobox
              value={form.officeClosingTime}
              onChange={(value) => updateForm({ officeClosingTime: value })}
            />
          </RuleToggleRow>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={saving}>
            {initial ? "Save changes" : "Create override"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
