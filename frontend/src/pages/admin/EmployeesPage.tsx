import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  KeyRound, Pencil, UserCheck, UserX, Power, Plus, Search, ShieldAlert,
  Image as ImageIcon, Trash2, Upload, RefreshCcw, Eye, EyeOff, User, CalendarOff,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, FieldWrapper, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import { SecureImage } from "@/components/SecureImage";
import * as employeesApi from "@/api/employees";
import * as attendanceApi from "@/api/attendance";
import type { AttendanceRecord, DependencyCounts, Employee } from "@/types";
import { extractErrorMessage } from "@/api/client";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { formatDate } from "@/utils/format";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** A record counts as "present" unless it is explicitly an absent entry. */
function presentEquivalent(record: AttendanceRecord): "present" | "absent" {
  return record.status === "absent" ? "absent" : "present";
}

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
  if (record.status === "absent") {
    return <Badge tone="red">Absent{record.is_admin_marked ? " (admin)" : ""}</Badge>;
  }
  if (record.status === "checked_in") return <Badge tone="blue">Checked in</Badge>;
  // checked_out
  return <Badge tone="green">{record.is_admin_marked ? "Present (admin)" : "Checked out"}</Badge>;
}

// ─── Main page ─────────────────────────────────────────────────────────────

export function EmployeesPage() {
  const { publicSettings } = usePublicSettings();
  const manualOverride = publicSettings?.attendance.allowManualOverride ?? true;

  const [items, setItems]     = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

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
  const [markTarget, setMarkTarget]       = useState<{ employee: Employee; action: "present" | "absent" } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<Employee | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      employeesApi.listEmployees({ search: search || undefined, limit: 100 }),
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

  function buildMenu(employee: Employee) {
    const marked = todayMap[employee.id];
    return [
      {
        label: "Change Password",
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
      },
      ...(manualOverride
        ? [
            {
              label: marked && presentEquivalent(marked) === "present" ? "Marked Present" : "Mark as Present",
              icon: <UserCheck className="h-4 w-4" />,
              divider: true as const,
              onClick: () => setMarkTarget({ employee, action: "present" }),
              disabled: !employee.is_active,
              disabledReason: !employee.is_active ? "Inactive" : undefined,
            },
            {
              label: marked && presentEquivalent(marked) === "absent" ? "Marked Absent" : "Mark as Absent",
              icon: <UserX className="h-4 w-4" />,
              onClick: () => setMarkTarget({ employee, action: "absent" }),
              disabled: !employee.is_active,
              disabledReason: !employee.is_active ? "Inactive" : undefined,
            },
          ]
        : []),
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
      },
    ];
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
          <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-slate-100">
            {e.profile_photo_path ? (
              <SecureImage path={e.profile_photo_path} alt={e.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{e.name}</p>
            <p className="text-xs text-slate-400">{e.employee_code}</p>
          </div>
        </div>
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
        subtitle="Create accounts, manage access, photos, passwords, and attendance"
        action={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
            Add Employee
          </Button>
        }
      />

      <Card className="mb-4">
        <form
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
          onSubmit={(e: FormEvent) => { e.preventDefault(); load(); }}
        >
          <div className="w-full sm:w-72">
            <Input
              label="Search"
              placeholder="Search by name or employee ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" icon={<Search className="h-4 w-4" />} className="sm:self-end">
            Search
          </Button>
        </form>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="No employees found" />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={items}
            rowKey={(e) => e.id}
            actions={(employee) => <OverflowMenu items={buildMenu(employee)} align="right" />}
          />
        )}
      </Card>

      {/* Create employee */}
      <CreateEmployeeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(creds) => { setCreateOpen(false); setCredentials(creds); load(); }}
      />

      {/* Credentials reveal */}
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

      {/* Change password */}
      {pwTarget && (
        <ChangePasswordModal
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

      {/* Mark present / absent (with override) */}
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
  const [error, setError]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await employeesApi.createEmployee({ name, email: email || null, phone: phone || null });
      setName(""); setEmail(""); setPhone("");
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

// ─── Credentials reveal ─────────────────────────────────────────────────────

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await employeesApi.updateEmployee(employee.id, {
        name,
        email: email || null,
        phone: phone || null,
        department: department || null,
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
        <Input label="Full Name" required value={name} onChange={(e) => setName(e.target.value)} />
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

// ─── Change password (direct entry) ─────────────────────────────────────────

function ChangePasswordModal({
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
  const [requireChange, setRequireChange] = useState(false);
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
        requireChange,
      });
      onDone(credentials);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Change Password — ${employee.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p><span className="font-medium">Employee:</span> {employee.name}</p>
          <p><span className="font-medium">ID:</span> {employee.employee_code}</p>
        </div>

        <FieldWrapper label="New Password" required>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              placeholder="Enter a new password"
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

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={requireChange}
            onChange={(e) => setRequireChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Require the employee to change it at next login
        </label>

        <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={loading} icon={<KeyRound className="h-4 w-4" />}>
            Update Password
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
  const [file, setFile]       = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [removing, setRemoving] = useState(false);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  }

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await employeesApi.adminSetEmployeeAvatar(employee.id, file);
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview(null);
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update the photo"));
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
    <Modal open onClose={onClose} title={`Profile Photo — ${employee.name}`}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex items-center gap-4">
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full bg-slate-100">
            {preview ? (
              <img src={preview} alt="New photo preview" className="h-full w-full object-cover" />
            ) : employee.profile_photo_path ? (
              <SecureImage path={employee.profile_photo_path} alt={employee.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <User className="h-9 w-9" />
              </div>
            )}
          </div>
          <div className="min-w-0 text-sm text-slate-500">
            <p className="font-medium text-slate-900">{employee.name}</p>
            <p>{employee.employee_code}</p>
            <p className="mt-1 text-xs">
              {preview ? "New photo selected — click Upload to save." : employee.profile_photo_path ? "Current profile photo." : "No profile photo set."}
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPick}
        />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<ImageIcon className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
            Choose Photo
          </Button>
          {file && (
            <Button icon={<Upload className="h-4 w-4" />} isLoading={saving} onClick={handleUpload}>
              Upload
            </Button>
          )}
          {employee.profile_photo_path && !preview && (
            <Button
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              isLoading={removing}
              onClick={handleRemove}
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
  const [days, setDays]   = useState<number[]>(employee.weekly_off_days ?? defaultWeeklyOffDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const updated = await employeesApi.updateWeeklyOff(employee.id, days);
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
          Select the days this employee does not work. They won't be marked absent on these days.
          Employees who work on Sundays should have Sunday left unchecked.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WEEKDAYS.map((wd) => {
            const active = days.includes(wd.value);
            return (
              <button
                key={wd.value}
                type="button"
                onClick={() => toggle(wd.value)}
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

        <p className="text-xs text-slate-400">
          {days.length === 0
            ? "No weekly off selected — attendance is expected every day."
            : `Weekly off: ${days.map((d) => WEEKDAYS[d].label).join(", ")}`}
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

// ─── Mark Present / Absent (with lock + override) ───────────────────────────

function MarkAttendanceModal({
  employee,
  action,
  existing,
  date,
  onClose,
  onDone,
}: {
  employee: Employee;
  action: "present" | "absent";
  existing: AttendanceRecord | null;
  date: string;
  onClose: () => void;
  onDone: (record: AttendanceRecord) => void;
}) {
  const [reason, setReason]     = useState(existing?.admin_mark_reason ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const isPresent = action === "present";
  const title = isPresent ? "Mark as Present" : "Mark as Absent";
  const Icon = isPresent ? UserCheck : UserX;

  const currentEquiv = existing ? presentEquivalent(existing) : null;
  const alreadySame = currentEquiv === action;
  const isOverride = Boolean(existing) && !alreadySame;

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const payload = { employeeId: employee.id, date, reason: reason || undefined, override: Boolean(existing) };
      const record = isPresent
        ? await attendanceApi.adminMarkPresent(payload)
        : await attendanceApi.adminMarkAbsent(payload);
      onDone(record);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to record attendance."));
    } finally {
      setSubmitting(false);
    }
  }

  const currentLabel = existing
    ? existing.status === "absent"
      ? "Absent"
      : existing.is_admin_marked
        ? "Present"
        : existing.status === "checked_in"
          ? "Checked in"
          : "Checked out / Present"
    : null;

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
          <Icon className={`h-8 w-8 flex-shrink-0 ${isPresent ? "text-green-500" : "text-red-500"}`} />
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
                <strong>{isPresent ? "Present" : "Absent"}</strong> for today. This status is locked for the day.
                To change it, use the “Mark as {isPresent ? "Absent" : "Present"}” option.
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
                  Currently recorded as <strong>{currentLabel}</strong>. Confirming will override it and set the
                  status to <strong>{isPresent ? "Present" : "Absent"}</strong> for {date}.
                </p>
              </div>
            )}

            <FieldWrapper label="Reason (optional)">
              <Textarea
                rows={2}
                placeholder={isPresent ? "e.g. Employee forgot to check in" : "e.g. On leave, no prior request submitted"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FieldWrapper>

            <Alert variant="info">
              {isPresent
                ? "This records a full-day present entry on behalf of the employee."
                : "This records an absent entry for the employee for this day."}
            </Alert>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button
                isLoading={submitting}
                onClick={handleConfirm}
                className={isPresent ? "" : "bg-red-600 hover:bg-red-700 text-white"}
                icon={<Icon className="h-4 w-4" />}
              >
                {isOverride ? "Confirm Change" : isPresent ? "Mark Present" : "Mark Absent"}
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
