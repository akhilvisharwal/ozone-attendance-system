import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  KeyRound, Pencil, UserCheck, UserMinus, UserX, Power, Plus, Search, ShieldAlert,
  Image as ImageIcon, Trash2, RefreshCcw, Eye, EyeOff, CalendarOff,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ContentSkeleton, EmptyState, Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, FieldWrapper, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { ProfilePhotoCropModal } from "@/components/ProfilePhotoCropModal";
import { PROFILE_PHOTO_ACCEPT, validateProfilePhotoFile } from "@/utils/profilePhoto";
import * as employeesApi from "@/api/employees";
import * as attendanceApi from "@/api/attendance";
import type { AttendanceRecord, DependencyCounts, Employee } from "@/types";
import { extractErrorMessage } from "@/api/client";
import { resolveWeeklyOffDays, employeeUsesDefaultWeeklyOff, normalizeWeeklyOffDays } from "@/utils/weeklyOffDays";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { usePermissions } from "@/auth/usePermissions";
import { formatDate } from "@/utils/format";
import { DesignationSelect } from "@/components/DesignationSelect";
import { EMPLOYEE_CODES_CHANGED_EVENT } from "@/utils/employeeCodeEvents";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type MarkAction = "present" | "half_day" | "absent";

/** Resolves the effective day bucket for manual marking and menu labels. */
function dayStatusEquivalent(record: AttendanceRecord): MarkAction {
  if (record.status === "absent" || record.day_status === "absent") return "absent";
  if (record.day_status === "half_day" || record.is_half_day || record.check_in_status === "half_day") {
    return "half_day";
  }
  return "present";
}

function currentStatusLabel(existing: AttendanceRecord): string {
  if (existing.is_admin_marked && existing.admin_mark_status) {
    const labels: Record<string, string> = {
      present: "Present",
      half_day: "Half Day",
      absent: "Absent",
      leave: "Leave",
      holiday: "Holiday",
      weekly_off: "Weekly Off",
    };
    return `${labels[existing.admin_mark_status] ?? "Manual"} (admin)`;
  }
  if (existing.status === "absent" || existing.day_status === "absent") return "Absent";
  if (existing.day_status === "half_day" || existing.is_half_day) return "Half Day";
  if (existing.is_admin_marked) return "Present";
  if (existing.status === "checked_in") return "Checked in";
  return "Checked out / Present";
}

const MARK_ACTION_LABELS: Record<MarkAction, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
};

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

function TodayStatusBadge({ record }: { record?: AttendanceRecord | null }) {
  if (!record) return <span className="text-xs text-slate-400">Not marked</span>;
  if (record.is_admin_marked && record.admin_mark_status) {
    const toneMap: Record<string, "green" | "amber" | "red" | "blue" | "slate"> = {
      present: "green",
      half_day: "amber",
      absent: "red",
      leave: "blue",
      holiday: "blue",
      weekly_off: "slate",
    };
    const labelMap: Record<string, string> = {
      present: "Present",
      half_day: "Half Day",
      absent: "Absent",
      leave: "Leave",
      holiday: "Holiday",
      weekly_off: "Weekly Off",
    };
    const status = record.admin_mark_status;
    return <Badge tone={toneMap[status] ?? "slate"}>{labelMap[status] ?? status} (admin)</Badge>;
  }
  if (record.status === "absent" || record.day_status === "absent") {
    return <Badge tone="red">Absent{record.is_admin_marked ? " (admin)" : ""}</Badge>;
  }
  if (record.day_status === "half_day" || record.is_half_day || record.check_in_status === "half_day") {
    return <Badge tone="amber">Half Day{record.is_admin_marked ? " (admin)" : ""}</Badge>;
  }
  if (record.status === "checked_in") return <Badge tone="blue">Checked in</Badge>;
  return <Badge tone="green">{record.is_admin_marked ? "Present (admin)" : "Checked out"}</Badge>;
}

// ─── Main page ─────────────────────────────────────────────────────────────

export function EmployeesPage() {
  const { publicSettings } = usePublicSettings();
  const { isMasterAdmin, can } = usePermissions();
  const manualOverride = publicSettings?.attendance.allowManualOverride ?? true;

  const [items, setItems]     = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [designationFilter, setDesignationFilter] = useState("");

  // Today's attendance keyed by employee id, so the page shows an always-current
  // status and can enforce the one-status-per-day lock.
  const [todayMap, setTodayMap] = useState<Record<string, AttendanceRecord>>({});
  const today = todayStr();

  // Modal visibility state
  const [createOpen, setCreateOpen]       = useState(false);
  const [credentials, setCredentials]     = useState<{ employeeId: string; temporaryPassword: string } | null>(null);
  const [editTarget, setEditTarget]       = useState<Employee | null>(null);
  const [pwTarget, setPwTarget]           = useState<Employee | null>(null);
  const [photoTarget, setPhotoTarget]     = useState<Employee | null>(null);
  const [weeklyOffTarget, setWeeklyOffTarget] = useState<Employee | null>(null);
  const [markTarget, setMarkTarget]       = useState<{ employee: Employee; action: MarkAction } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<Employee | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      employeesApi.listEmployees({
        search: search || undefined,
        designationId: designationFilter || undefined,
        limit: 100,
      }),
      loadToday(),
    ])
      .then(([res]) => setItems(res.items))
      .finally(() => setLoading(false));
  }

  async function loadToday() {
    try {
      const res = await attendanceApi.adminListAttendance({ from: today, to: today, limit: 200 });
      const map: Record<string, AttendanceRecord> = {};
      for (const row of res.items) map[row.employee_id] = row;
      setTodayMap(map);
    } catch {
      setTodayMap({});
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    function onCodesChanged() {
      void load();
    }
    window.addEventListener(EMPLOYEE_CODES_CHANGED_EVENT, onCodesChanged);
    return () => window.removeEventListener(EMPLOYEE_CODES_CHANGED_EVENT, onCodesChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildMenu(employee: Employee) {
    const marked = todayMap[employee.id];
    const items = [];

    if (isMasterAdmin) {
      items.push(
        {
          label: "Reset Password",
          icon: <KeyRound className="h-4 w-4" />,
          onClick: () => setPwTarget(employee),
        },
        {
          label: "Change Profile Photo",
          icon: <ImageIcon className="h-4 w-4" />,
          onClick: () => setPhotoTarget(employee),
        },
        {
          label: "Edit Employee Details",
          icon: <Pencil className="h-4 w-4" />,
          onClick: () => setEditTarget(employee),
        },
        {
          label: "Configure Weekly Off",
          icon: <CalendarOff className="h-4 w-4" />,
          onClick: () => setWeeklyOffTarget(employee),
        }
      );
    }

    if (manualOverride && (isMasterAdmin || can("editAttendance"))) {
      items.push(
        {
          label: marked && dayStatusEquivalent(marked) === "present" ? "Marked Present" : "Mark as Present",
          icon: <UserCheck className="h-4 w-4" />,
          divider: items.length > 0,
          onClick: () => setMarkTarget({ employee, action: "present" as const }),
          disabled: !employee.is_active,
          disabledReason: !employee.is_active ? "Inactive" : undefined,
        },
        {
          label: marked && dayStatusEquivalent(marked) === "half_day" ? "Marked Half Day" : "Mark as Half Day",
          icon: <UserMinus className="h-4 w-4" />,
          onClick: () => setMarkTarget({ employee, action: "half_day" as const }),
          disabled: !employee.is_active,
          disabledReason: !employee.is_active ? "Inactive" : undefined,
        },
        {
          label: marked && dayStatusEquivalent(marked) === "absent" ? "Marked Absent" : "Mark as Absent",
          icon: <UserX className="h-4 w-4" />,
          onClick: () => setMarkTarget({ employee, action: "absent" as const }),
          disabled: !employee.is_active,
          disabledReason: !employee.is_active ? "Inactive" : undefined,
        }
      );
    }

    if (isMasterAdmin) {
      items.push(
        {
          label: employee.is_active ? "Deactivate Employee" : "Activate Employee",
          icon: <Power className="h-4 w-4" />,
          danger: employee.is_active,
          divider: true,
          onClick: () => {
            if (employee.is_active) {
              setDeactivateTarget(employee);
            } else {
              handleActivate(employee);
            }
          },
        },
        {
          label: "Delete Employee",
          icon: <Trash2 className="h-4 w-4" />,
          danger: true,
          onClick: () => setDeleteTarget(employee),
        }
      );
    }

    return items;
  }

  async function handleActivate(employee: Employee) {
    const updated = await employeesApi.setEmployeeActive(employee.id, true);
    setItems((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  const columns: Column<Employee>[] = [
    {
      header: "Employee",
      primary: true,
      cell: (e) => (
        <div className="flex items-center gap-3">
          <EmployeeAvatar name={e.name} photoPath={e.profile_photo_path} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{e.name}</p>
            <p className="text-xs text-slate-400">{e.employee_code}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Role",
      cell: (e) => (
        <span className="text-sm text-slate-700">{e.designation?.trim() || "—"}</span>
      ),
    },
    {
      header: "Contact",
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate">{e.email ?? "-"}</div>
          <div className="truncate text-xs text-slate-400">{e.phone ?? ""}</div>
        </div>
      ),
    },
    { header: "Today", cell: (e) => <TodayStatusBadge record={todayMap[e.id]} /> },
    { header: "Joined", cell: (e) => formatDate(e.created_at) },
    {
      header: "Status",
      cell: (e) => (
        <Badge tone={e.is_active ? "green" : "red"}>{e.is_active ? "Active" : "Deactivated"}</Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={
          isMasterAdmin
            ? "Create accounts, manage access, photos, passwords, and attendance"
            : "View employee directory and attendance status"
        }
        action={
          isMasterAdmin ? (
            <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
              Add Employee
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <form
          className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e: FormEvent) => { e.preventDefault(); load(); }}
        >
          <div className="w-full sm:w-72">
            <Input
              label="Search"
              placeholder="Search by name, ID, or role"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-64">
            <DesignationSelect
              label="Filter by role"
              value={designationFilter}
              onChange={setDesignationFilter}
              allowEmpty
              allowCustom={false}
              emptyLabel="All roles"
            />
          </div>
          <Button type="submit" variant="outline" icon={<Search className="h-4 w-4" />} className="sm:self-end">
            Search
          </Button>
        </form>
      </Card>

      <Card>
        <CrossfadeSwitch state={loading ? "loading" : "content"}>
        {loading ? (
          <ContentSkeleton />
        ) : items.length === 0 ? (
          <EmptyState title="No employees found" />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={items}
            rowKey={(e) => e.id}
            actions={(employee) => {
              const menu = buildMenu(employee);
              return menu.length > 0 ? <OverflowMenu items={menu} align="right" /> : null;
            }}
          />
        )}
        </CrossfadeSwitch>
      </Card>

      {/* Create employee */}
      <CreateEmployeeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(creds) => { setCreateOpen(false); setCredentials(creds); load(); }}
      />

      {/* One-time temporary credentials after create / reset */}
      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />

      {/* Edit employee details */}
      {editTarget && (
        <EditEmployeeModal
          employee={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditTarget(null);
          }}
        />
      )}

      {/* Reset password */}
      {pwTarget && (
        <ResetPasswordModal
          employee={pwTarget}
          onClose={() => setPwTarget(null)}
          onDone={(creds) => { setPwTarget(null); setCredentials(creds); }}
        />
      )}

      {/* Manage profile photo */}
      {photoTarget && (
        <ManagePhotoModal
          employee={photoTarget}
          onClose={() => setPhotoTarget(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setPhotoTarget(updated);
          }}
        />
      )}

      {/* Configure weekly off days */}
      {weeklyOffTarget && (
        <WeeklyOffModal
          employee={weeklyOffTarget}
          defaultWeeklyOffDays={publicSettings?.weeklyOff.defaultWeeklyOffDays ?? [0]}
          onClose={() => setWeeklyOffTarget(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setWeeklyOffTarget(null);
          }}
        />
      )}

      {/* Mark present / half day / absent (with override) */}
      {markTarget && (
        <MarkAttendanceModal
          employee={markTarget.employee}
          action={markTarget.action}
          existing={todayMap[markTarget.employee.id] ?? null}
          date={today}
          onClose={() => setMarkTarget(null)}
          onDone={(record) => {
            setTodayMap((prev) => ({ ...prev, [record.employee_id]: record }));
            setMarkTarget(null);
          }}
        />
      )}

      {/* Deactivate confirmation */}
      {deactivateTarget && (
        <ConfirmDeactivateModal
          employee={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onConfirmed={(updated) => {
            setItems((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setDeactivateTarget(null);
          }}
        />
      )}

      {/* Delete (soft) confirmation */}
      {deleteTarget && (
        <ConfirmDeleteEmployeeModal
          employee={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((e) => e.id !== id));
            setTodayMap((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Create employee ────────────────────────────────────────────────────────

function CreateEmployeeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (creds: { employeeId: string; temporaryPassword: string }) => void;
}) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [phone, setPhone]       = useState("");
  const [designationId, setDesignationId] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPhone("");
    setDesignationId("");
    setError(null);
    void employeesApi.fetchDesignations().then((data) => {
      if (data.defaultDesignationId) {
        setDesignationId(data.defaultDesignationId);
      }
    });
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!designationId) {
      setError("Please select a Role / Designation.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await employeesApi.createEmployee({
        name,
        email: email || null,
        phone: phone || null,
        designationId,
      });
      setName("");
      setEmail("");
      setPhone("");
      setDesignationId("");
      onCreated(result.credentials);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create employee"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Employee">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Input label="Full Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <DesignationSelect
          label="Role / Designation"
          required
          value={designationId}
          onChange={setDesignationId}
        />
        <Input label="Email" type="email" hint="Optional" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Phone" hint="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <p className="text-xs text-slate-400">
          A unique Employee ID and temporary password will be generated automatically.
        </p>
        <Button type="submit" isLoading={submitting} className="mt-2">Create Employee</Button>
      </form>
    </Modal>
  );
}

// ─── One-time temporary credentials ─────────────────────────────────────────

function CredentialsModal({
  credentials,
  onClose,
}: {
  credentials: { employeeId: string; temporaryPassword: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!credentials} onClose={onClose} title="Employee Credentials">
      {credentials && (
        <div className="flex flex-col gap-4">
          <Alert variant="success">
            Share these credentials with the employee securely. The password will not be shown again.
          </Alert>
          <div className="rounded-lg bg-slate-50 p-4 font-mono text-sm">
            <p><span className="text-slate-400">Employee ID: </span>{credentials.employeeId}</p>
            <p><span className="text-slate-400">Password: </span>{credentials.temporaryPassword}</p>
          </div>
          <Button onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}

// ─── Edit employee ──────────────────────────────────────────────────────────

function EditEmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: (updated: Employee) => void;
}) {
  const [name, setName]   = useState(employee.name);
  const [email, setEmail] = useState(employee.email ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [department, setDepartment] = useState(employee.department ?? "");
  const [designationId, setDesignationId] = useState(employee.designation_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!designationId) {
      setError("Please select a Role / Designation.");
      return;
    }
    setSaving(true);
    try {
      const updated = await employeesApi.updateEmployee(employee.id, {
        name,
        email: email || null,
        phone: phone || null,
        department: department || null,
        designationId,
      });
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update employee"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit — ${employee.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p><span className="font-medium">Employee ID:</span> {employee.employee_code}</p>
          {employee.designation && (
            <p><span className="font-medium">Current role:</span> {employee.designation}</p>
          )}
        </div>
        <Input label="Full Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <DesignationSelect
          label="Role / Designation"
          required
          value={designationId}
          onChange={setDesignationId}
        />
        <Input label="Email" type="email" hint="Optional" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Phone" hint="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Department" hint="Optional — shown on attendance reports" value={department} onChange={(e) => setDepartment(e.target.value)} />
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Reset password (assign temporary password; shown once) ─────────────────

function ResetPasswordModal({
  employee,
  onClose,
  onDone,
}: {
  employee: Employee;
  onClose: () => void;
  onDone: (creds: { employeeId: string; temporaryPassword: string }) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  function fillGenerated() {
    const pw = generatePassword();
    setPassword(pw);
    setConfirm(pw);
    setShow(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const { credentials } = await employeesApi.changeEmployeePassword(employee.id, {
        newPassword: password,
      });
      onDone(credentials);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not reset password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Reset Password — ${employee.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p>
            Assign a new temporary password. It is stored only as a secure hash and shown once
            after save — it cannot be retrieved later.
          </p>
          <p className="mt-2"><span className="font-medium">Employee:</span> {employee.name}</p>
          <p><span className="font-medium">ID:</span> {employee.employee_code}</p>
        </div>

        <FieldWrapper label="Temporary Password" required>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              placeholder="Enter or generate a temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FieldWrapper>

        <Input
          label="Confirm Password"
          type={show ? "text" : "password"}
          placeholder="Re-enter the password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        <button
          type="button"
          onClick={fillGenerated}
          className="flex items-center gap-1.5 self-start text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <RefreshCcw className="h-3.5 w-3.5" /> Generate a strong password
        </button>

        <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={loading} icon={<KeyRound className="h-4 w-4" />}>
            Reset Password
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Manage profile photo ────────────────────────────────────────────────────

function ManagePhotoModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: (updated: Employee) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const validation = validateProfilePhotoFile(f);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setCropFile(f);
  }

  async function handleCropped(blob: Blob) {
    setSaving(true);
    setError(null);
    try {
      const updated = await employeesApi.adminSetEmployeeAvatar(employee.id, blob);
      setCropFile(null);
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update the photo"));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setRemoving(true);
    try {
      const updated = await employeesApi.adminDeleteEmployeeAvatar(employee.id);
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not remove the photo"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title={`Profile Photo — ${employee.name}`}>
        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex items-center gap-4">
            <EmployeeAvatar name={employee.name} photoPath={employee.profile_photo_path} size="xl" />
            <div className="min-w-0 text-sm text-slate-500">
              <p className="font-medium text-slate-900">{employee.name}</p>
              <p>{employee.employee_code}</p>
              {employee.designation && <p className="text-slate-600">{employee.designation}</p>}
              <p className="mt-1 text-xs">
                JPG, PNG, or WebP · max 2 MB. Cropped and saved as WebP.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={PROFILE_PHOTO_ACCEPT}
            className="hidden"
            onChange={onPick}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<ImageIcon className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
              {employee.profile_photo_path ? "Replace Photo" : "Choose Photo"}
            </Button>
            {employee.profile_photo_path && (
              <Button
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                isLoading={removing}
                onClick={() => void handleRemove()}
                className="text-red-600 hover:bg-red-50"
              >
                Remove Photo
              </Button>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>

      <ProfilePhotoCropModal
        open={Boolean(cropFile)}
        file={cropFile}
        saving={saving}
        onClose={() => setCropFile(null)}
        onConfirm={handleCropped}
      />
    </>
  );
}

// ─── Configure weekly off ───────────────────────────────────────────────────

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function WeeklyOffModal({
  employee,
  onClose,
  onSaved,
  defaultWeeklyOffDays,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: (updated: Employee) => void;
  defaultWeeklyOffDays: number[];
}) {
  const usesDefaultInitially = employeeUsesDefaultWeeklyOff(employee);
  const [useCompanyDefault, setUseCompanyDefault] = useState(usesDefaultInitially);
  const [days, setDays] = useState<number[]>(() =>
    resolveWeeklyOffDays(employee, defaultWeeklyOffDays)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(day: number) {
    setUseCompanyDefault(false);
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : normalizeWeeklyOffDays([...prev, day])
    );
  }

  function handleUseDefaultChange(checked: boolean) {
    setUseCompanyDefault(checked);
    if (checked) {
      setDays(normalizeWeeklyOffDays(defaultWeeklyOffDays));
    }
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const updated = await employeesApi.updateWeeklyOff(
        employee.id,
        useCompanyDefault ? defaultWeeklyOffDays : days,
        useCompanyDefault
      );
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update weekly off days"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Weekly Off — ${employee.name}`}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <p className="text-sm text-slate-500">
          Use the company default schedule or set custom weekly off days for this employee. Custom
          schedules override the default in attendance, reports, and dashboards.
        </p>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={useCompanyDefault}
            onChange={(e) => handleUseDefaultChange(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">Use company default weekly off</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Follows Settings → Weekly Off & Holidays automatically when the default changes.
            </span>
          </span>
        </label>

        <div className={useCompanyDefault ? "pointer-events-none opacity-60" : undefined}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {WEEKDAYS.map((wd) => {
              const active = days.includes(wd.value);
              return (
                <button
                  key={wd.value}
                  type="button"
                  onClick={() => toggle(wd.value)}
                  disabled={useCompanyDefault}
                  className={
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition " +
                    (active
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50")
                  }
                >
                  {wd.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-slate-400">
          {useCompanyDefault
            ? `Using company default: ${days.map((d) => WEEKDAYS[d].label).join(", ") || "none"}`
            : days.length === 0
              ? "No weekly off selected — attendance is expected every day."
              : `Custom weekly off: ${days.map((d) => WEEKDAYS[d].label).join(", ")}`}
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button isLoading={saving} onClick={handleSave} icon={<CalendarOff className="h-4 w-4" />}>
            Save Weekly Off
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Mark Present / Half Day / Absent (with lock + override) ─────────────────

const MARK_ACTION_META: Record<
  MarkAction,
  {
    title: string;
    confirmLabel: string;
    overrideLabel: string;
    info: string;
    icon: typeof UserCheck;
    iconClass: string;
    buttonClass: string;
    placeholder: string;
  }
> = {
  present: {
    title: "Mark as Present",
    confirmLabel: "Mark Present",
    overrideLabel: "Present",
    info: "This records a full-day present entry on behalf of the employee.",
    icon: UserCheck,
    iconClass: "text-green-500",
    buttonClass: "",
    placeholder: "e.g. Employee forgot to check in",
  },
  half_day: {
    title: "Mark as Half Day",
    confirmLabel: "Mark Half Day",
    overrideLabel: "Half Day",
    info: "This records a half-day attendance entry on behalf of the employee.",
    icon: UserMinus,
    iconClass: "text-amber-500",
    buttonClass: "bg-amber-500 hover:bg-amber-600 text-white",
    placeholder: "e.g. Employee left early with approval",
  },
  absent: {
    title: "Mark as Absent",
    confirmLabel: "Mark Absent",
    overrideLabel: "Absent",
    info: "This records an absent entry for the employee for this day.",
    icon: UserX,
    iconClass: "text-red-500",
    buttonClass: "bg-red-600 hover:bg-red-700 text-white",
    placeholder: "e.g. On leave, no prior request submitted",
  },
};

function MarkAttendanceModal({
  employee,
  action,
  existing,
  date,
  onClose,
  onDone,
}: {
  employee: Employee;
  action: MarkAction;
  existing: AttendanceRecord | null;
  date: string;
  onClose: () => void;
  onDone: (record: AttendanceRecord) => void;
}) {
  const [reason, setReason]     = useState(existing?.admin_mark_reason ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const meta = MARK_ACTION_META[action];
  const Icon = meta.icon;

  const currentEquiv = existing ? dayStatusEquivalent(existing) : null;
  const alreadySame = currentEquiv === action;
  const isOverride = Boolean(existing) && !alreadySame;

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const payload = { employeeId: employee.id, date, reason: reason || undefined, override: Boolean(existing) };
      const record =
        action === "present"
          ? await attendanceApi.adminMarkPresent(payload)
          : action === "half_day"
            ? await attendanceApi.adminMarkHalfDay(payload)
            : await attendanceApi.adminMarkAbsent(payload);
      onDone(record);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to record attendance."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={meta.title}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
          <Icon className={`h-8 w-8 flex-shrink-0 ${meta.iconClass}`} />
          <div>
            <p className="font-medium text-slate-900">{employee.name}</p>
            <p className="text-sm text-slate-500">{employee.employee_code} · {date}</p>
          </div>
        </div>

        {alreadySame ? (
          <>
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <ShieldAlert className="h-5 w-5 flex-shrink-0" />
              <p>
                <strong>{employee.name}</strong> is already marked as{" "}
                <strong>{MARK_ACTION_LABELS[action]}</strong> for today. This status is locked for the day.
                To change it, choose Mark as Present, Mark as Half Day, or Mark as Absent.
              </p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </>
        ) : (
          <>
            {isOverride && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Currently recorded as <strong>{existing ? currentStatusLabel(existing) : ""}</strong>. Confirming will override it and set the
                  status to <strong>{meta.overrideLabel}</strong> for {date}.
                </p>
              </div>
            )}

            <FieldWrapper label="Reason (optional)">
              <Textarea
                rows={2}
                placeholder={meta.placeholder}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FieldWrapper>

            <Alert variant="info">{meta.info}</Alert>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button
                isLoading={submitting}
                onClick={handleConfirm}
                className={meta.buttonClass}
                icon={<Icon className="h-4 w-4" />}
              >
                {isOverride ? "Confirm Change" : meta.confirmLabel}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Deactivate confirmation ────────────────────────────────────────────────

function ConfirmDeactivateModal({
  employee,
  onClose,
  onConfirmed,
}: {
  employee: Employee;
  onClose: () => void;
  onConfirmed: (updated: Employee) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      const updated = await employeesApi.setEmployeeActive(employee.id, false);
      onConfirmed(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not deactivate employee"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Deactivate Employee">
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Alert variant="error">
          Are you sure you want to deactivate <strong>{employee.name}</strong>?
          They will no longer be able to log in.
        </Alert>
        <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
          <p><span className="font-medium">Employee:</span> {employee.name}</p>
          <p><span className="font-medium">ID:</span> {employee.employee_code}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={loading}
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
            icon={<Power className="h-4 w-4" />}
          >
            Deactivate
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Delete employee (soft) ─────────────────────────────────────────────────

function ConfirmDeleteEmployeeModal({
  employee,
  onClose,
  onDeleted,
}: {
  employee: Employee;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deps, setDeps]       = useState<DependencyCounts | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    employeesApi.getEmployeeDependencies(employee.id)
      .then(setDeps)
      .catch(() => setDeps(null))
      .finally(() => setChecking(false));
  }, [employee.id]);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await employeesApi.deleteEmployee(employee.id);
      onDeleted(employee.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not delete employee"));
    } finally {
      setLoading(false);
    }
  }

  const hasRecords = deps && (deps.attendance > 0 || deps.leaves > 0 || deps.tasks > 0);

  return (
    <Modal open onClose={onClose} title="Delete Employee">
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="error">
          Are you sure you want to delete <strong>{employee.name}</strong>? This removes the account
          from all active lists, dropdowns, and statistics.
        </Alert>

        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p><span className="font-medium">Employee:</span> {employee.name}</p>
          <p><span className="font-medium">ID:</span> {employee.employee_code}</p>
        </div>

        {checking ? (
          <div className="flex justify-center py-2"><Spinner /></div>
        ) : hasRecords ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">Related records will be preserved</p>
              <p className="mt-0.5">
                This employee has{" "}
                {[
                  deps!.attendance ? `${deps!.attendance} attendance record${deps!.attendance === 1 ? "" : "s"}` : null,
                  deps!.leaves ? `${deps!.leaves} leave request${deps!.leaves === 1 ? "" : "s"}` : null,
                  deps!.tasks ? `${deps!.tasks} task${deps!.tasks === 1 ? "" : "s"}` : null,
                ].filter(Boolean).join(", ")}
                . To protect historical reports, the account is soft-deleted — these records are kept
                but the employee can no longer log in and won't appear anywhere.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">This employee has no related records.</p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={loading}
            disabled={checking}
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
            icon={<Trash2 className="h-4 w-4" />}
          >
            Delete Employee
          </Button>
        </div>
      </div>
    </Modal>
  );
}
