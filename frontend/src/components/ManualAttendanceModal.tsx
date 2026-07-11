import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { Input, Select, Textarea, FieldWrapper } from "@/components/ui/Input";
import { TimeSlotCombobox } from "@/components/ui/TimeSlotCombobox";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import { DesignationSelect } from "@/components/DesignationSelect";
import * as attendanceApi from "@/api/attendance";
import * as employeesApi from "@/api/employees";
import { extractErrorMessage } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import type { AdminAttendanceRow, Employee, ManualAttendanceStatus } from "@/types";

const STATUS_OPTIONS: { value: ManualAttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half Day" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "holiday", label: "Holiday" },
  { value: "weekly_off", label: "Weekly Off" },
  { value: "holiday_worked", label: "Worked on Holiday" },
  { value: "weekly_off_worked", label: "Worked on Weekly Off" },
  { value: "not_applicable", label: "Not Applicable" },
];

function requiresTimes(status: ManualAttendanceStatus): boolean {
  return (
    status === "present" ||
    status === "half_day" ||
    status === "holiday_worked" ||
    status === "weekly_off_worked"
  );
}

function statusFromCellHint(hint?: string | null): ManualAttendanceStatus {
  const allowed = new Set(STATUS_OPTIONS.map((option) => option.value));
  if (hint && allowed.has(hint as ManualAttendanceStatus)) {
    return hint as ManualAttendanceStatus;
  }
  return "present";
}

export function ManualAttendanceModal({
  open,
  onClose,
  onSaved,
  initialEmployeeId,
  initialDate,
  initialStatus,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialEmployeeId?: string;
  initialDate?: string;
  initialStatus?: string;
}) {
  const { employee: currentAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admins, setAdmins] = useState<Employee[]>([]);

  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [date, setDate] = useState(initialDate ?? "");
  const [status, setStatus] = useState<ManualAttendanceStatus>("present");
  const [checkInTime, setCheckInTime] = useState("09:00");
  const [checkOutTime, setCheckOutTime] = useState("18:00");
  const [totalMinutes, setTotalMinutes] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [approvedById, setApprovedById] = useState("");
  const [existing, setExisting] = useState<AdminAttendanceRow | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);

  const [applyToMultiple, setApplyToMultiple] = useState(false);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const isEditingManual = existing?.is_admin_marked === true;
  const showTimeFields = requiresTimes(status);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return allEmployees.filter((employee) => {
      if (roleFilter && employee.designation_id !== roleFilter) return false;
      if (!query) return true;
      return (
        employee.name.toLowerCase().includes(query) ||
        employee.employee_code.toLowerCase().includes(query) ||
        (employee.designation ?? "").toLowerCase().includes(query)
      );
    });
  }, [allEmployees, employeeSearch, roleFilter]);

  const selectedCount = useMemo(() => {
    const ids = new Set(selectedEmployeeIds);
    if (employeeId) ids.add(employeeId);
    return ids.size;
  }, [selectedEmployeeIds, employeeId]);

  const allFilteredSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every((employee) => selectedEmployeeIds.includes(employee.id));

  const loadExisting = useCallback(async () => {
    if (!employeeId || !date) {
      setExisting(null);
      setNeedsOverride(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const record = await attendanceApi.adminGetAttendanceForDate(employeeId, date);
      setExisting(record);
      if (record) {
        if (record.admin_mark_status) {
          setStatus(record.admin_mark_status as ManualAttendanceStatus);
        } else if (record.special_day_status === "holiday_worked") {
          setStatus("holiday_worked");
        } else if (record.special_day_status === "weekly_off_worked") {
          setStatus("weekly_off_worked");
        } else if (record.day_status === "half_day") {
          setStatus("half_day");
        } else if (record.day_status === "absent" || record.status === "absent") {
          setStatus("absent");
        } else {
          setStatus("present");
        }
        setReason(record.admin_mark_reason ?? "");
        setApprovedById(record.admin_approved_by ?? record.admin_marked_by ?? currentAdmin?.id ?? "");
        if (record.check_in_time) {
          setCheckInTime(new Date(record.check_in_time).toTimeString().slice(0, 5));
        }
        if (record.check_out_time) {
          setCheckOutTime(new Date(record.check_out_time).toTimeString().slice(0, 5));
        }
        setTotalMinutes(record.total_minutes ?? "");
        setNeedsOverride(!record.is_admin_marked);
      } else {
        setNeedsOverride(false);
        setApprovedById(currentAdmin?.id ?? "");
        setStatus(statusFromCellHint(initialStatus));
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load attendance for this date."));
    } finally {
      setLoading(false);
    }
  }, [employeeId, date, currentAdmin?.id, initialStatus]);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(initialEmployeeId ?? "");
    setDate(initialDate ?? "");
    setStatus(statusFromCellHint(initialStatus));
    setCheckInTime("09:00");
    setCheckOutTime("18:00");
    setTotalMinutes("");
    setReason("");
    setApprovedById(currentAdmin?.id ?? "");
    setExisting(null);
    setNeedsOverride(false);
    setConfirmOpen(false);
    setError(null);
    setApplyToMultiple(false);
    setEmployeeSearch("");
    setRoleFilter("");
    setSelectedEmployeeIds(initialEmployeeId ? [initialEmployeeId] : []);
  }, [open, initialEmployeeId, initialDate, initialStatus, currentAdmin?.id]);

  useEffect(() => {
    if (!open || !employeeId || !date) return;
    void loadExisting();
  }, [open, employeeId, date, loadExisting]);

  useEffect(() => {
    if (!open) return;
    if (currentAdmin && (currentAdmin.role === "admin" || currentAdmin.role === "junior_admin")) {
      setAdmins([currentAdmin]);
      return;
    }
    setAdmins([]);
  }, [open, currentAdmin]);

  useEffect(() => {
    if (!open || !applyToMultiple) return;
    let cancelled = false;
    setLoadingEmployees(true);
    employeesApi
      .listActiveEmployees()
      .then((items) => {
        if (cancelled) return;
        setAllEmployees(items);
        setSelectedEmployeeIds((prev) => {
          const next = new Set(prev);
          if (employeeId) next.add(employeeId);
          return Array.from(next);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Could not load employees."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEmployees(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, applyToMultiple, employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    setSelectedEmployeeIds((prev) => (prev.includes(employeeId) ? prev : [...prev, employeeId]));
  }, [employeeId]);

  const workingHoursPreview = useMemo(() => {
    if (!showTimeFields || !checkInTime || !checkOutTime) return null;
    const [inH, inM] = checkInTime.split(":").map(Number);
    const [outH, outM] = checkOutTime.split(":").map(Number);
    const mins = Math.max(0, outH * 60 + outM - (inH * 60 + inM));
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }, [showTimeFields, checkInTime, checkOutTime]);

  function validate(): string | null {
    if (!employeeId) return "Select an employee.";
    if (!date) return "Select a date.";
    if (!reason.trim()) return "Reason is required.";
    if (showTimeFields && (!checkInTime || !checkOutTime)) {
      return "Check-in and check-out times are required for Present, Half Day, and worked special days.";
    }
    if (applyToMultiple && selectedCount < 1) {
      return "Select at least one employee.";
    }
    return null;
  }

  function targetEmployeeIds(): string[] {
    if (!applyToMultiple) return [employeeId];
    const ids = new Set(selectedEmployeeIds);
    if (employeeId) ids.add(employeeId);
    return Array.from(ids);
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const targets = targetEmployeeIds();
    const needsBulkConfirm = applyToMultiple && targets.length > 1;
    if ((needsOverride || needsBulkConfirm) && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payloadBase = {
        date,
        status,
        reason: reason.trim(),
        approvedById: approvedById || currentAdmin?.id,
        checkInTime: showTimeFields ? checkInTime : null,
        checkOutTime: showTimeFields ? checkOutTime : null,
        totalMinutes: typeof totalMinutes === "number" ? totalMinutes : null,
        override: true,
      };

      if (applyToMultiple && targets.length > 1) {
        await attendanceApi.saveBulkManualAttendance({
          ...payloadBase,
          employeeIds: targets,
        });
      } else {
        await attendanceApi.saveManualAttendance({
          ...payloadBase,
          employeeId,
          override: needsOverride || isEditingManual,
        });
      }
      setConfirmOpen(false);
      onSaved();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save manual attendance."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!employeeId || !date || !isEditingManual || applyToMultiple) return;
    if (!window.confirm("Delete this manual attendance record? The day will revert to automatic rules.")) return;

    setDeleting(true);
    setError(null);
    try {
      await attendanceApi.deleteManualAttendance({ employeeId, date });
      onSaved();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not delete manual attendance."));
    } finally {
      setDeleting(false);
    }
  }

  function toggleEmployee(id: string) {
    if (id === employeeId) return;
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedEmployeeIds((prev) =>
        prev.filter((id) => id === employeeId || !filteredEmployees.some((emp) => emp.id === id))
      );
      return;
    }
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (employeeId) next.add(employeeId);
      for (const employee of filteredEmployees) next.add(employee.id);
      return Array.from(next);
    });
  }

  const confirmTitle =
    applyToMultiple && selectedCount > 1 ? "Apply to Multiple Employees?" : "Override Existing Attendance?";

  const confirmMessage =
    applyToMultiple && selectedCount > 1
      ? `This will apply the same attendance status, times, remarks, and date to ${selectedCount} employees. Existing records for ${date} will be updated instead of creating duplicates.`
      : `This will replace the existing attendance record for ${date} with your manual entry. The change will be logged in the audit trail.`;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Edit Attendance"
        description="Set or update attendance for any date, including blank days, weekends, holidays, and dates before joining."
        widthClassName={applyToMultiple ? "max-w-3xl" : "max-w-2xl"}
        footer={
          <ModalFooterActions>
            {isEditingManual && !applyToMultiple && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDelete()}
                disabled={saving || deleting}
                isLoading={deleting}
                icon={<Trash2 className="h-4 w-4" />}
                className="mr-auto text-red-600 hover:text-red-700"
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || deleting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving || deleting}
              isLoading={saving}
              icon={<Save className="h-4 w-4" />}
            >
              {applyToMultiple && selectedCount > 1 ? `Save for ${selectedCount}` : "Save Changes"}
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          {needsOverride && !confirmOpen && !applyToMultiple && (
            <Alert variant="info">
              This employee already has automatic attendance for {date}. Saving will override it with your manual entry.
            </Alert>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading existing record…" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <EmployeeCombobox label="Employee" value={employeeId} onChange={setEmployeeId} />
                <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  checked={applyToMultiple}
                  onChange={(e) => setApplyToMultiple(e.target.checked)}
                />
                <span>
                  <span className="font-medium text-slate-900">Apply to Multiple Employees</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Use the same status, times, remarks, and date for every selected employee.
                  </span>
                </span>
              </label>

              {applyToMultiple && (
                <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      label="Search employees"
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      placeholder="Name, ID, or role"
                    />
                    <DesignationSelect
                      label="Role filter"
                      value={roleFilter}
                      onChange={setRoleFilter}
                      allowEmpty
                      allowCustom={false}
                      emptyLabel="All roles"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        disabled={loadingEmployees || filteredEmployees.length === 0}
                      />
                      Select All Employees
                    </label>
                    <span className="text-xs text-slate-500">{selectedCount} selected</span>
                  </div>

                  {loadingEmployees ? (
                    <div className="flex justify-center py-6">
                      <Spinner label="Loading employees…" />
                    </div>
                  ) : filteredEmployees.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">No employees match your filters.</p>
                  ) : (
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-100 bg-white p-2">
                      {filteredEmployees.map((employee) => {
                        const checked = selectedEmployeeIds.includes(employee.id);
                        const locked = employee.id === employeeId;
                        return (
                          <label
                            key={employee.id}
                            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                              checked={checked}
                              disabled={locked}
                              onChange={() => toggleEmployee(employee.id)}
                            />
                            <span className="min-w-0">
                              <span className="block font-medium text-slate-900">
                                {employee.name}
                                {locked ? (
                                  <span className="ml-1 text-xs font-normal text-slate-400">(original)</span>
                                ) : null}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {[employee.employee_code, employee.designation].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <Select
                label="Attendance Status"
                required
                value={status}
                onChange={(e) => setStatus(e.target.value as ManualAttendanceStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              {showTimeFields && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <TimeSlotCombobox label="Check-in Time" required value={checkInTime} onChange={setCheckInTime} />
                  <TimeSlotCombobox label="Check-out Time" required value={checkOutTime} onChange={setCheckOutTime} />
                  <Input
                    label="Working Minutes"
                    type="number"
                    min={0}
                    max={1440}
                    value={totalMinutes}
                    onChange={(e) => setTotalMinutes(e.target.value === "" ? "" : Number(e.target.value))}
                    hint={workingHoursPreview ? `Calculated: ${workingHoursPreview}` : undefined}
                  />
                </div>
              )}

              <FieldWrapper label="Reason / Remarks" required>
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this manual attendance entry is being recorded"
                />
              </FieldWrapper>

              <Select
                label="Approved By"
                required
                value={approvedById}
                onChange={(e) => setApprovedById(e.target.value)}
              >
                <option value="">Select approver</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name} ({admin.employee_code})
                  </option>
                ))}
              </Select>

              {existing?.is_admin_marked && !applyToMultiple && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p>
                    Last updated by{" "}
                    <span className="font-medium text-slate-900">
                      {existing.admin_marked_by_name ?? "Admin"}
                    </span>
                    {existing.admin_approved_by_name &&
                      existing.admin_approved_by_name !== existing.admin_marked_by_name && (
                        <> · Approved by {existing.admin_approved_by_name}</>
                      )}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmTitle}
        widthClassName="max-w-md"
        compact
        footer={
          <ModalFooterActions>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} isLoading={saving} icon={<Save className="h-4 w-4" />}>
              {applyToMultiple && selectedCount > 1 ? "Confirm Apply" : "Confirm Override"}
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700">{confirmMessage}</p>
        </div>
      </Modal>
    </>
  );
}
