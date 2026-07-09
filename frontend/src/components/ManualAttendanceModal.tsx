import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { Input, Select, Textarea, FieldWrapper } from "@/components/ui/Input";
import { TimeSlotCombobox } from "@/components/ui/TimeSlotCombobox";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
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
];

function requiresTimes(status: ManualAttendanceStatus): boolean {
  return status === "present" || status === "half_day";
}

export function ManualAttendanceModal({
  open,
  onClose,
  onSaved,
  initialEmployeeId,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialEmployeeId?: string;
  initialDate?: string;
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

  const isEditingManual = existing?.is_admin_marked === true;
  const showTimeFields = requiresTimes(status);

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
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load attendance for this date."));
    } finally {
      setLoading(false);
    }
  }, [employeeId, date, currentAdmin?.id]);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(initialEmployeeId ?? "");
    setDate(initialDate ?? "");
    setStatus("present");
    setCheckInTime("09:00");
    setCheckOutTime("18:00");
    setTotalMinutes("");
    setReason("");
    setApprovedById(currentAdmin?.id ?? "");
    setExisting(null);
    setNeedsOverride(false);
    setConfirmOpen(false);
    setError(null);
  }, [open, initialEmployeeId, initialDate, currentAdmin?.id]);

  useEffect(() => {
    if (!open || !employeeId || !date) return;
    void loadExisting();
  }, [open, employeeId, date, loadExisting]);

  useEffect(() => {
    if (!open) return;
    employeesApi
      .listEmployees({ limit: 100, isActive: true })
      .then((res) => setAdmins(res.items.filter((item) => item.role === "admin")))
      .catch(() => setAdmins([]));
  }, [open]);

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
      return "Check-in and check-out times are required for Present and Half Day.";
    }
    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (needsOverride && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await attendanceApi.saveManualAttendance({
        employeeId,
        date,
        status,
        reason: reason.trim(),
        approvedById: approvedById || currentAdmin?.id,
        checkInTime: showTimeFields ? checkInTime : null,
        checkOutTime: showTimeFields ? checkOutTime : null,
        totalMinutes: typeof totalMinutes === "number" ? totalMinutes : null,
        override: needsOverride || isEditingManual,
      });
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
    if (!employeeId || !date || !isEditingManual) return;
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

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEditingManual ? "Edit Manual Attendance" : "Add Manual Attendance"}
        widthClassName="max-w-2xl"
        footer={
          <ModalFooterActions>
            {isEditingManual && (
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
              Save Changes
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          {needsOverride && !confirmOpen && (
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

              {existing?.is_admin_marked && (
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
        title="Override Existing Attendance?"
        widthClassName="max-w-md"
        compact
        footer={
          <ModalFooterActions>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} isLoading={saving} icon={<Save className="h-4 w-4" />}>
              Confirm Override
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700">
            This will replace the existing attendance record for {date} with your manual entry. The change will be
            logged in the audit trail.
          </p>
        </div>
      </Modal>
    </>
  );
}
