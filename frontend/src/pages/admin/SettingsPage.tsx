import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  Building2,
  Clock,
  CalendarDays,
  Users,
  Smartphone,
  FileText,
  Shield,
  Database,
  Bell,
  Palette,
  ScrollText,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { FieldRow, SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { useSettings } from "@/contexts/SettingsContext";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import type { AppSettings, AuditLogEntry, SettingsCategory } from "@/types/settings";
import { SETTINGS_NAV, WEEKDAY_LABELS } from "@/types/settings";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";

type TabId = SettingsCategory | "audit" | "backup";

const ICONS: Partial<Record<TabId, ReactNode>> = {
  company: <Building2 className="h-4 w-4" />,
  attendance: <Clock className="h-4 w-4" />,
  leave: <CalendarDays className="h-4 w-4" />,
  weeklyOff: <CalendarDays className="h-4 w-4" />,
  employee: <Users className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
  reports: <FileText className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  backup: <Database className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  appearance: <Palette className="h-4 w-4" />,
  audit: <ScrollText className="h-4 w-4" />,
};

export function SettingsPage() {
  const { settings, loading, saveCategory, refresh, error: loadError } = useSettings();

  useEffect(() => {
    refresh();
  }, [refresh]);
  const [tab, setTab] = useState<TabId>("company");
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [audit, setAudit] = useState<{ logs: AuditLogEntry[]; total: number; page: number } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (settings) setDraft(JSON.parse(JSON.stringify(settings)) as AppSettings);
  }, [settings]);

  const loadAudit = useCallback(async (page = 1) => {
    setAuditLoading(true);
    try {
      const res = await settingsApi.fetchAuditLogs({ page, limit: 25 });
      setAudit({ logs: res.logs, total: res.total, page: res.page });
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "audit") loadAudit(1);
  }, [tab, loadAudit]);

  async function saveCurrentCategory() {
    if (!draft || tab === "audit" || tab === "backup") return;
    const snapshot = JSON.parse(JSON.stringify(draft)) as AppSettings;
    setSaving(true);
    setMessage(null);
    try {
      if (tab === "company" && logoFile) {
        await settingsApi.uploadCompanyLogo(logoFile);
        setLogoFile(null);
      }
      let payload = draft[tab];
      if (tab === "attendance") {
        payload = {
          ...draft.attendance,
          checkinOpenTime: draft.attendance.officeStartTime,
          checkinOntimeEnd: draft.attendance.lateCheckInTime,
        };
      }
      await saveCategory(tab, payload);
      setMessage({ type: "success", text: "Settings saved and applied immediately." });
      await refresh();
    } catch (err) {
      setDraft(snapshot);
      setMessage({ type: "error", text: extractErrorMessage(err, "Failed to save settings") });
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setSaving(true);
    try {
      const data = await settingsApi.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ozone-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: "Data export downloaded." });
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Export failed") });
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (pwd.next !== pwd.confirm) {
      setMessage({ type: "error", text: "New passwords do not match." });
      return;
    }
    setSaving(true);
    try {
      await settingsApi.changeAdminPassword(pwd.current, pwd.next);
      setPwd({ current: "", next: "", confirm: "" });
      setMessage({ type: "success", text: "Password updated successfully." });
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err, "Password change failed") });
    } finally {
      setSaving(false);
    }
  }

  function applyPatch<C extends SettingsCategory>(category: C, updates: Partial<AppSettings[C]>) {
    setDraft((d) => (d ? { ...d, [category]: { ...d[category], ...updates } } : d));
  }

  const auditColumns: Column<AuditLogEntry>[] = [
    {
      header: "When",
      primary: true,
      cell: (r) => new Date(r.created_at).toLocaleString(),
    },
    { header: "Admin", cell: (r) => r.actor_name ?? "System" },
    { header: "Action", cell: (r) => r.action },
    { header: "Target", cell: (r) => r.target_type ?? "—" },
  ];

  if (loading) return <Spinner label="Loading settings…" />;
  if (loadError && !draft) {
    return (
      <Alert variant="error">
        {loadError}. <button type="button" className="underline" onClick={() => refresh()}>Retry</button>
      </Alert>
    );
  }
  if (!draft) return <Spinner label="Loading settings…" />;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure the Attendance Management System — changes apply immediately"
      />

      {message && (
        <div className="mb-4">
          <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav className="flex shrink-0 flex-row gap-2 overflow-x-auto pb-2 lg:w-56 lg:flex-col lg:overflow-visible lg:pb-0">
          {SETTINGS_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={clsx(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                tab === item.id
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {ICONS[item.id]}
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {tab === "company" && (
            <SettingsSection
              title="Company Settings"
              description="Organization profile used in reports and the application"
              onSave={saveCurrentCategory}
              saving={saving}
            >
              <FieldRow label="Company Name">
                <Input value={draft.company.name} onChange={(e) => applyPatch("company", { name: e.target.value })} />
              </FieldRow>
              <FieldRow label="Company Logo" hint="PNG or JPG, max 4 MB">
                <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
                <p className="mt-1 text-xs text-slate-400">Current: {draft.company.logoPath || "default"}</p>
              </FieldRow>
              <FieldRow label="Address">
                <Input value={draft.company.address} onChange={(e) => applyPatch("company", { address: e.target.value })} />
              </FieldRow>
              <FieldRow label="Contact Number">
                <Input value={draft.company.phone} onChange={(e) => applyPatch("company", { phone: e.target.value })} />
              </FieldRow>
              <FieldRow label="Email">
                <Input type="email" value={draft.company.email} onChange={(e) => applyPatch("company", { email: e.target.value })} />
              </FieldRow>
              <FieldRow label="GST Number" hint="Optional">
                <Input value={draft.company.gstNumber} onChange={(e) => applyPatch("company", { gstNumber: e.target.value })} />
              </FieldRow>
              <FieldRow label="Time Zone">
                <Input value={draft.company.timezone} onChange={(e) => applyPatch("company", { timezone: e.target.value })} />
              </FieldRow>
              <FieldRow label="Date Format">
                <Select value={draft.company.dateFormat} onChange={(e) => applyPatch("company", { dateFormat: e.target.value })}>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </Select>
              </FieldRow>
              <FieldRow label="Time Format">
                <Select value={draft.company.timeFormat} onChange={(e) => applyPatch("company", { timeFormat: e.target.value as "12h" | "24h" })}>
                  <option value="12h">12 Hour</option>
                  <option value="24h">24 Hour</option>
                </Select>
              </FieldRow>
            </SettingsSection>
          )}

          {tab === "attendance" && (
            <SettingsSection title="Attendance Settings" onSave={saveCurrentCategory} saving={saving}>
              <FieldRow label="Office Start Time" hint="Also used as check-in open time">
                <Input type="time" value={draft.attendance.officeStartTime} onChange={(e) => applyPatch("attendance", { officeStartTime: e.target.value, checkinOpenTime: e.target.value })} />
              </FieldRow>
              <FieldRow label="Late Check-In After" hint="End of on-time window">
                <Input type="time" value={draft.attendance.lateCheckInTime} onChange={(e) => applyPatch("attendance", { lateCheckInTime: e.target.value, checkinOntimeEnd: e.target.value })} />
              </FieldRow>
              <FieldRow label="Office Closing Time">
                <Input type="time" value={draft.attendance.officeClosingTime} onChange={(e) => applyPatch("attendance", { officeClosingTime: e.target.value })} />
              </FieldRow>
              <FieldRow label="Half-Day Cutoff">
                <Input type="time" value={draft.attendance.halfDayCutoff} onChange={(e) => applyPatch("attendance", { halfDayCutoff: e.target.value })} />
              </FieldRow>
              <FieldRow label="Min Hours for Present">
                <Input type="number" min={1} max={24} step={0.5} value={draft.attendance.minHoursPresent} onChange={(e) => applyPatch("attendance", { minHoursPresent: +e.target.value })} />
              </FieldRow>
              <FieldRow label="Min Hours for Half Day">
                <Input type="number" min={0.5} max={12} step={0.5} value={draft.attendance.minHoursHalfDay} onChange={(e) => applyPatch("attendance", { minHoursHalfDay: +e.target.value })} />
              </FieldRow>
              <ToggleRow label="Automatic Attendance Calculation" checked={draft.attendance.autoCalculate} onChange={(v) => applyPatch("attendance", { autoCalculate: v })} />
              <ToggleRow label="Allow Manual Attendance Override" checked={draft.attendance.allowManualOverride} onChange={(v) => applyPatch("attendance", { allowManualOverride: v })} />
              <ToggleRow label="Allow Multiple Check-Ins" checked={draft.attendance.allowMultipleCheckIns} onChange={(v) => applyPatch("attendance", { allowMultipleCheckIns: v })} />
            </SettingsSection>
          )}

          {tab === "leave" && (
            <SettingsSection title="Leave Settings" onSave={saveCurrentCategory} saving={saving}>
              <FieldRow label="Leave Types" hint="Comma-separated">
                <Input value={draft.leave.leaveTypes.join(", ")} onChange={(e) => applyPatch("leave", { leaveTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </FieldRow>
              <FieldRow label="Annual Leave Limit">
                <Input type="number" value={draft.leave.annualLimit} onChange={(e) => applyPatch("leave", { annualLimit: +e.target.value })} />
              </FieldRow>
              <FieldRow label="Sick Leave Limit">
                <Input type="number" value={draft.leave.sickLimit} onChange={(e) => applyPatch("leave", { sickLimit: +e.target.value })} />
              </FieldRow>
              <FieldRow label="Casual Leave Limit">
                <Input type="number" value={draft.leave.casualLimit} onChange={(e) => applyPatch("leave", { casualLimit: +e.target.value })} />
              </FieldRow>
              <ToggleRow label="Approval Required" checked={draft.leave.approvalRequired} onChange={(v) => applyPatch("leave", { approvalRequired: v })} />
              <ToggleRow label="Half-Day Leave Option" checked={draft.leave.halfDayAllowed} onChange={(v) => applyPatch("leave", { halfDayAllowed: v })} />
            </SettingsSection>
          )}

          {tab === "weeklyOff" && (
            <>
              <SettingsSection title="Default Weekly Off" onSave={saveCurrentCategory} saving={saving}>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, i) => {
                    const selected = draft.weeklyOff.defaultWeeklyOffDays.includes(i);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const days = selected
                            ? draft.weeklyOff.defaultWeeklyOffDays.filter((d) => d !== i)
                            : [...draft.weeklyOff.defaultWeeklyOffDays, i];
                          applyPatch("weeklyOff", { defaultWeeklyOffDays: days.sort() });
                        }}
                        className={clsx(
                          "rounded-lg border px-3 py-2 text-sm font-medium",
                          selected ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </SettingsSection>
              <SettingsSection title="Related Configuration" description="Manage holidays and per-employee weekly off">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link to="/admin/holidays" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
                    Holiday Management <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  <Link to="/admin/employees" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
                    Employee Weekly Off <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </SettingsSection>
            </>
          )}

          {tab === "employee" && (
            <SettingsSection title="Employee Settings" onSave={saveCurrentCategory} saving={saving}>
              <FieldRow label="Default Role">
                <Select value={draft.employee.defaultRole} onChange={(e) => applyPatch("employee", { defaultRole: e.target.value as "employee" | "admin" })}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </Select>
              </FieldRow>
              <FieldRow label="Employee ID Format" hint="e.g. OZN###">
                <Input value={draft.employee.idFormat} onChange={(e) => applyPatch("employee", { idFormat: e.target.value })} />
              </FieldRow>
              <FieldRow label="Default Password (new employees)">
                <Input type="password" value={draft.employee.defaultPassword} onChange={(e) => applyPatch("employee", { defaultPassword: e.target.value })} />
              </FieldRow>
              <ToggleRow label="Require Password Change on First Login" checked={draft.employee.requirePasswordChange} onChange={(v) => applyPatch("employee", { requirePasswordChange: v })} />
              <ToggleRow label="Profile Photo Required" checked={draft.employee.profilePhotoRequired} onChange={(v) => applyPatch("employee", { profilePhotoRequired: v })} />
            </SettingsSection>
          )}

          {tab === "mobile" && (
            <SettingsSection title="Mobile Attendance Settings" onSave={saveCurrentCategory} saving={saving}>
              <ToggleRow label="GPS Required for Check-In" checked={draft.mobile.gpsRequiredCheckIn} onChange={(v) => applyPatch("mobile", { gpsRequiredCheckIn: v })} />
              <ToggleRow label="GPS Required for Check-Out" checked={draft.mobile.gpsRequiredCheckOut} onChange={(v) => applyPatch("mobile", { gpsRequiredCheckOut: v })} />
              <ToggleRow label="Selfie Required for Check-In" checked={draft.mobile.selfieRequiredCheckIn} onChange={(v) => applyPatch("mobile", { selfieRequiredCheckIn: v })} />
              <ToggleRow label="Selfie Required for Check-Out" checked={draft.mobile.selfieRequiredCheckOut} onChange={(v) => applyPatch("mobile", { selfieRequiredCheckOut: v })} />
              <ToggleRow label="Allow Camera Switching" checked={draft.mobile.allowCameraSwitch} onChange={(v) => applyPatch("mobile", { allowCameraSwitch: v })} />
              <FieldRow label="GPS Accuracy Threshold (meters)">
                <Input type="number" value={draft.mobile.gpsAccuracyThresholdMeters} onChange={(e) => applyPatch("mobile", { gpsAccuracyThresholdMeters: +e.target.value })} />
              </FieldRow>
            </SettingsSection>
          )}

          {tab === "reports" && (
            <SettingsSection title="Reports & PDF Settings" onSave={saveCurrentCategory} saving={saving}>
              <ToggleRow label="Company Logo in Reports" checked={draft.reports.includeLogo} onChange={(v) => applyPatch("reports", { includeLogo: v })} />
              <FieldRow label="Company Signature / Footer Text">
                <Input value={draft.reports.signatureText} onChange={(e) => applyPatch("reports", { signatureText: e.target.value })} />
              </FieldRow>
              <FieldRow label="Default Report Format">
                <Select value={draft.reports.defaultFormat} onChange={(e) => applyPatch("reports", { defaultFormat: e.target.value as "pdf" | "excel" })}>
                  <option value="pdf">PDF</option>
                  <option value="excel">Excel</option>
                </Select>
              </FieldRow>
              <ToggleRow label="Auto Page Numbering" checked={draft.reports.autoPageNumbers} onChange={(v) => applyPatch("reports", { autoPageNumbers: v })} />
            </SettingsSection>
          )}

          {tab === "security" && (
            <>
              <SettingsSection title="Security Policy" onSave={saveCurrentCategory} saving={saving}>
                <FieldRow label="Session Timeout (minutes)">
                  <Input type="number" value={draft.security.sessionTimeoutMinutes} onChange={(e) => applyPatch("security", { sessionTimeoutMinutes: +e.target.value })} />
                </FieldRow>
                <FieldRow label="Login Attempt Limit">
                  <Input type="number" value={draft.security.loginAttemptLimit} onChange={(e) => applyPatch("security", { loginAttemptLimit: +e.target.value })} />
                </FieldRow>
                <FieldRow label="Minimum Password Length">
                  <Input type="number" value={draft.security.passwordMinLength} onChange={(e) => applyPatch("security", { passwordMinLength: +e.target.value })} />
                </FieldRow>
                <ToggleRow label="Require Uppercase" checked={draft.security.requireUppercase} onChange={(v) => applyPatch("security", { requireUppercase: v })} />
                <ToggleRow label="Require Numbers" checked={draft.security.requireNumbers} onChange={(v) => applyPatch("security", { requireNumbers: v })} />
                <ToggleRow label="Two-Factor Authentication" hint="Coming soon" checked={draft.security.twoFactorEnabled} onChange={(v) => applyPatch("security", { twoFactorEnabled: v })} disabled />
              </SettingsSection>
              <SettingsSection title="Change Admin Password" onSave={handlePasswordChange} saving={saving} saveLabel="Update password">
                <FieldRow label="Current Password">
                  <Input type="password" value={pwd.current} onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} />
                </FieldRow>
                <FieldRow label="New Password">
                  <Input type="password" value={pwd.next} onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} />
                </FieldRow>
                <FieldRow label="Confirm New Password">
                  <Input type="password" value={pwd.confirm} onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} />
                </FieldRow>
              </SettingsSection>
            </>
          )}

          {tab === "notifications" && (
            <SettingsSection title="Notifications" onSave={saveCurrentCategory} saving={saving}>
              <ToggleRow label="Email Notifications" checked={draft.notifications.emailEnabled} onChange={(v) => applyPatch("notifications", { emailEnabled: v })} />
              <ToggleRow label="Leave Approval Notifications" checked={draft.notifications.leaveApproval} onChange={(v) => applyPatch("notifications", { leaveApproval: v })} />
              <ToggleRow label="Attendance Reminder Notifications" checked={draft.notifications.attendanceReminder} onChange={(v) => applyPatch("notifications", { attendanceReminder: v })} />
              <ToggleRow label="Holiday Notifications" checked={draft.notifications.holidayNotifications} onChange={(v) => applyPatch("notifications", { holidayNotifications: v })} />
            </SettingsSection>
          )}

          {tab === "appearance" && (
            <SettingsSection title="Appearance" onSave={saveCurrentCategory} saving={saving}>
              <FieldRow label="Theme">
                <Select value={draft.appearance.theme} onChange={(e) => applyPatch("appearance", { theme: e.target.value as AppSettings["appearance"]["theme"] })}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </Select>
              </FieldRow>
              <FieldRow label="Accent Color">
                <Input type="color" value={draft.appearance.accentColor} onChange={(e) => applyPatch("appearance", { accentColor: e.target.value })} className="h-10 w-20" />
              </FieldRow>
              <ToggleRow label="Collapsed Sidebar (future)" checked={draft.appearance.sidebarCollapsed} onChange={(v) => applyPatch("appearance", { sidebarCollapsed: v })} />
            </SettingsSection>
          )}

          {tab === "backup" && (
            <SettingsSection title="Backup & Database" description="Export system data for backup or migration">
              <p className="text-sm text-slate-600">
                Download a JSON snapshot of employees, attendance, leaves, holidays, settings, and audit logs.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleExport} isLoading={saving}>Export All Data</Button>
                <Link to="/admin/reports">
                  <Button variant="outline">Attendance Reports</Button>
                </Link>
                <Link to="/admin/employees">
                  <Button variant="outline">Manage Employees</Button>
                </Link>
              </div>
              <p className="text-xs text-slate-400">Database restore and Excel import require server access — contact your system administrator.</p>
            </SettingsSection>
          )}

          {tab === "audit" && (
            <SettingsSection title="Audit Logs" description="Complete history of administrative actions">
              {auditLoading ? (
                <Spinner />
              ) : audit ? (
                <>
                  <ResponsiveTable columns={auditColumns} data={audit.logs} rowKey={(r) => r.id} />
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-500">{audit.total} total entries</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={audit.page <= 1} onClick={() => loadAudit(audit.page - 1)}>Previous</Button>
                      <Button size="sm" variant="outline" disabled={audit.page * 25 >= audit.total} onClick={() => loadAudit(audit.page + 1)}>Next</Button>
                    </div>
                  </div>
                </>
              ) : null}
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}
