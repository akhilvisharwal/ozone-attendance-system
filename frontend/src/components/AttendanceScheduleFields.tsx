import type { ReactNode } from "react";
import { Input } from "@/components/ui/Input";
import { TimeSlotCombobox } from "@/components/ui/TimeSlotCombobox";
import type { AttendanceScheduleInput } from "@/api/employees";
import type { AttendanceSettings } from "@/types/settings";

/**
 * The standing per-employee attendance schedule form, shared between the
 * single-employee modal and the bulk-apply modal on the Employees page.
 * Mirrors the "toggle a rule on to override it, default otherwise" UX of
 * AttendanceOverrideFormModal (Settings → Attendance daily overrides) so the
 * two "same 6 fields, different lifetime" forms feel like the same feature.
 */

export type ScheduleRuleKey =
  | "officeStartTime"
  | "lateCheckInTime"
  | "halfDayCutoff"
  | "officeClosingTime"
  | "minHoursPresent"
  | "minHoursHalfDay";

export interface AttendanceScheduleFormState {
  enabled: Record<ScheduleRuleKey, boolean>;
  officeStartTime: string;
  lateCheckInTime: string;
  halfDayCutoff: string;
  officeClosingTime: string;
  minHoursPresent: number;
  minHoursHalfDay: number;
}

export function emptyAttendanceScheduleForm(defaults: AttendanceSettings): AttendanceScheduleFormState {
  return {
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

/** Prefills the form from an employee's existing standing schedule (null fields stay "off"). */
export function formFromStandingSchedule(
  defaults: AttendanceSettings,
  employee: {
    standing_office_start_time?: string | null;
    standing_late_check_in_time?: string | null;
    standing_half_day_cutoff?: string | null;
    standing_office_closing_time?: string | null;
    standing_min_hours_present?: number | null;
    standing_min_hours_half_day?: number | null;
  }
): AttendanceScheduleFormState {
  return {
    enabled: {
      officeStartTime: employee.standing_office_start_time != null,
      lateCheckInTime: employee.standing_late_check_in_time != null,
      halfDayCutoff: employee.standing_half_day_cutoff != null,
      officeClosingTime: employee.standing_office_closing_time != null,
      minHoursPresent: employee.standing_min_hours_present != null,
      minHoursHalfDay: employee.standing_min_hours_half_day != null,
    },
    officeStartTime: employee.standing_office_start_time ?? defaults.officeStartTime,
    lateCheckInTime: employee.standing_late_check_in_time ?? defaults.lateCheckInTime,
    halfDayCutoff: employee.standing_half_day_cutoff ?? defaults.halfDayCutoff,
    officeClosingTime: employee.standing_office_closing_time ?? defaults.officeClosingTime,
    minHoursPresent: employee.standing_min_hours_present ?? defaults.minHoursPresent,
    minHoursHalfDay: employee.standing_min_hours_half_day ?? defaults.minHoursHalfDay,
  };
}

export function attendanceScheduleFormToPayload(form: AttendanceScheduleFormState): AttendanceScheduleInput {
  return {
    officeStartTime: form.enabled.officeStartTime ? form.officeStartTime : null,
    lateCheckInTime: form.enabled.lateCheckInTime ? form.lateCheckInTime : null,
    halfDayCutoff: form.enabled.halfDayCutoff ? form.halfDayCutoff : null,
    officeClosingTime: form.enabled.officeClosingTime ? form.officeClosingTime : null,
    minHoursPresent: form.enabled.minHoursPresent ? form.minHoursPresent : null,
    minHoursHalfDay: form.enabled.minHoursHalfDay ? form.minHoursHalfDay : null,
  };
}

export function validateAttendanceScheduleForm(form: AttendanceScheduleFormState): string | null {
  if (
    form.enabled.minHoursHalfDay &&
    form.enabled.minHoursPresent &&
    form.minHoursHalfDay >= form.minHoursPresent
  ) {
    return "Half-day hours must be less than present hours.";
  }
  return null;
}

/** Human-readable summary of the effective schedule, for "Currently: …" / "Using company default" text. */
export function describeEffectiveSchedule(form: AttendanceScheduleFormState): string {
  const parts: string[] = [];
  if (form.enabled.officeStartTime) parts.push(`${form.officeStartTime} start`);
  if (form.enabled.lateCheckInTime) parts.push(`late after ${form.lateCheckInTime}`);
  if (form.enabled.halfDayCutoff) parts.push(`half-day after ${form.halfDayCutoff}`);
  if (form.enabled.officeClosingTime) parts.push(`closes ${form.officeClosingTime}`);
  if (form.enabled.minHoursPresent) parts.push(`${form.minHoursPresent}h for present`);
  if (form.enabled.minHoursHalfDay) parts.push(`${form.minHoursHalfDay}h for half day`);
  if (parts.length === 0) return "Using company default for every rule.";
  return `Currently: ${parts.join(", ")}.`;
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

export function AttendanceScheduleFields({
  form,
  defaultRules,
  onToggle,
  onChange,
}: {
  form: AttendanceScheduleFormState;
  defaultRules: AttendanceSettings;
  onToggle: (key: ScheduleRuleKey, enabled: boolean) => void;
  onChange: (patch: Partial<AttendanceScheduleFormState>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-900">Rules to customize for this schedule</p>
      <p className="text-xs text-slate-500">
        Check each rule that should differ from the company default. Unchecked rules follow
        Settings → Attendance automatically, even when that default later changes.
      </p>

      <RuleToggleRow
        label="Office start time"
        description={`Company default: ${defaultRules.officeStartTime}`}
        checked={form.enabled.officeStartTime}
        onToggle={(checked) => onToggle("officeStartTime", checked)}
      >
        <TimeSlotCombobox
          value={form.officeStartTime}
          onChange={(value) => onChange({ officeStartTime: value })}
        />
      </RuleToggleRow>

      <RuleToggleRow
        label="Late check-in after"
        description={`Company default: ${defaultRules.lateCheckInTime}`}
        checked={form.enabled.lateCheckInTime}
        onToggle={(checked) => onToggle("lateCheckInTime", checked)}
      >
        <TimeSlotCombobox
          value={form.lateCheckInTime}
          onChange={(value) => onChange({ lateCheckInTime: value })}
        />
      </RuleToggleRow>

      <RuleToggleRow
        label="Half-day cutoff"
        description={`Company default: ${defaultRules.halfDayCutoff}`}
        checked={form.enabled.halfDayCutoff}
        onToggle={(checked) => onToggle("halfDayCutoff", checked)}
      >
        <TimeSlotCombobox
          value={form.halfDayCutoff}
          onChange={(value) => onChange({ halfDayCutoff: value })}
        />
      </RuleToggleRow>

      <RuleToggleRow
        label="Office closing time"
        description={`Company default: ${defaultRules.officeClosingTime}`}
        checked={form.enabled.officeClosingTime}
        onToggle={(checked) => onToggle("officeClosingTime", checked)}
      >
        <TimeSlotCombobox
          value={form.officeClosingTime}
          onChange={(value) => onChange({ officeClosingTime: value })}
        />
      </RuleToggleRow>

      <RuleToggleRow
        label="Minimum hours for Present"
        description={`Company default: ${defaultRules.minHoursPresent}h`}
        checked={form.enabled.minHoursPresent}
        onToggle={(checked) => onToggle("minHoursPresent", checked)}
      >
        <Input
          type="number"
          min={0.5}
          max={24}
          step={0.5}
          value={form.minHoursPresent}
          onChange={(e) => onChange({ minHoursPresent: Number(e.target.value) })}
        />
      </RuleToggleRow>

      <RuleToggleRow
        label="Minimum hours for Half Day"
        description={`Company default: ${defaultRules.minHoursHalfDay}h`}
        checked={form.enabled.minHoursHalfDay}
        onToggle={(checked) => onToggle("minHoursHalfDay", checked)}
      >
        <Input
          type="number"
          min={0.5}
          max={12}
          step={0.5}
          value={form.minHoursHalfDay}
          onChange={(e) => onChange({ minHoursHalfDay: Number(e.target.value) })}
        />
      </RuleToggleRow>
    </div>
  );
}
