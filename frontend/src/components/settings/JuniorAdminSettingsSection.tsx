import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, KeyRound, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { EmailOtpModal } from "@/components/EmailOtpModal";
import * as juniorAdminsApi from "@/api/juniorAdmins";
import { extractErrorMessage } from "@/api/client";
import { useToast } from "@/components/ui/Toast";
import type { Employee } from "@/types";
import type { OtpPurpose } from "@/api/emailVerification";
import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_PERMISSION_META,
  defaultJuniorAdminPermissions,
  normalizePermissions,
  type AdminPermissions,
} from "@/auth/permissions";

type FormState = {
  name: string;
  employeeCode: string;
  email: string;
  phone: string;
  password: string;
  isActive: boolean;
  permissions: AdminPermissions;
};

function emptyForm(): FormState {
  return {
    name: "",
    employeeCode: "",
    email: "",
    phone: "",
    password: "",
    isActive: true,
    permissions: defaultJuniorAdminPermissions(),
  };
}

function employeeToForm(employee: Employee): FormState {
  return {
    name: employee.name,
    employeeCode: employee.employee_code,
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    password: "",
    isActive: employee.is_active,
    permissions: normalizePermissions(employee.admin_permissions),
  };
}

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

export function JuniorAdminSettingsSection() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [credentials, setCredentials] = useState<{ employeeId: string; temporaryPassword: string } | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<Employee | null>(null);
  const [passwordForm, setPasswordForm] = useState({ password: "" });
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await juniorAdminsApi.listJuniorAdmins());
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load Junior Admins."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setCredentials(null);
    setCreateConfirmOpen(false);
    setSaveConfirmOpen(false);
    setEditorOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditing(employee);
    setForm(employeeToForm(employee));
    setCredentials(null);
    setCreateConfirmOpen(false);
    setSaveConfirmOpen(false);
    setEditorOpen(true);
  }

  function openPasswordReset(employee: Employee) {
    setPasswordTarget(employee);
    setPasswordForm({ password: generatePassword() });
    setError(null);
  }

  function requestSave() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    if (editing) {
      setSaveConfirmOpen(true);
    } else {
      setCreateConfirmOpen(true);
    }
  }

  async function handleSave() {
    setCreateConfirmOpen(false);
    setSaveConfirmOpen(false);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (editing) {
        await juniorAdminsApi.updateJuniorAdmin(editing.id, {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          permissions: form.permissions,
          isActive: form.isActive,
        });
        setMessage(`Updated ${form.name.trim()}.`);
        showToast("Settings saved successfully.");
        setEditorOpen(false);
        await load();
      } else {
        // Create requires email OTP verification before the account is created.
        setOtpPurpose("junior_admin_create");
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save Junior Admin."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateOtpVerified(otp: { otpChallengeId: string; otpCode: string }) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await juniorAdminsApi.createJuniorAdmin({
        name: form.name.trim(),
        employeeCode: form.employeeCode.trim() || undefined,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        password: form.password.trim() || undefined,
        permissions: form.permissions,
        isActive: form.isActive,
        ...otp,
      });
      setCredentials(created.credentials);
      setMessage(`Created Junior Admin ${created.employee.name}.`);
      showToast("Settings saved successfully.");
      setOtpPurpose(null);
      setEditorOpen(false);
      await load();
    } catch (err) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(employee: Employee) {
    setError(null);
    try {
      await juniorAdminsApi.setJuniorAdminActive(employee.id, !employee.is_active);
      setMessage(
        `${employee.name} ${employee.is_active ? "deactivated" : "activated"}.`
      );
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update status."));
    }
  }

  async function handleResetPassword() {
    if (!passwordTarget) return;
    setSaving(true);
    setError(null);
    try {
      const result = await juniorAdminsApi.resetJuniorAdminPassword(passwordTarget.id, {
        password: passwordForm.password.trim() || undefined,
      });
      setCredentials(result.credentials);
      setMessage(`Password reset for ${passwordTarget.name}.`);
      setPasswordTarget(null);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not reset password."));
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteOtp() {
    if (!deleteTarget) return;
    setError(null);
    setOtpPurpose("junior_admin_delete");
  }

  async function handleDeleteOtpVerified(otp: { otpChallengeId: string; otpCode: string }) {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await juniorAdminsApi.deleteJuniorAdmin(deleteTarget.id, otp);
      setMessage(`Deleted ${deleteTarget.name}.`);
      setDeleteTarget(null);
      setOtpPurpose(null);
      await load();
    } catch (err) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleOtpVerified(otp: { otpChallengeId: string; otpCode: string }) {
    if (otpPurpose === "junior_admin_create") {
      await handleCreateOtpVerified(otp);
      return;
    }
    if (otpPurpose === "junior_admin_delete") {
      await handleDeleteOtpVerified(otp);
    }
  }

  function setPermission(key: keyof AdminPermissions, value: boolean) {
    setForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: value },
    }));
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Junior Admin accounts"
        description="Create limited admin accounts and grant only the permissions they need. Junior Admins cannot access Settings, Security, Database, Backup, Audit Logs, or other sensitive controls."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {items.length} Junior Admin{items.length === 1 ? "" : "s"}
          </p>
          <Button type="button" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add Junior Admin
          </Button>
        </div>

        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {credentials && (
          <Alert variant="success">
            Credentials — ID: <strong>{credentials.employeeId}</strong>, temporary password:{" "}
            <strong>{credentials.temporaryPassword}</strong>. Share securely; it will not be shown again.
          </Alert>
        )}

        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title="No Junior Admins yet"
            description="Create a Junior Admin to monitor attendance and send reminders without full admin access."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Permissions</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((item) => {
                  const perms = normalizePermissions(item.admin_permissions);
                  const enabledCount = ADMIN_PERMISSION_KEYS.filter((key) => perms[key]).length;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar name={item.name} photoPath={item.profile_photo_path} size="sm" />
                          <span className="font-medium text-slate-900">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.employee_code}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            item.is_active
                              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                          }
                        >
                          {item.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {enabledCount} of {ADMIN_PERMISSION_KEYS.length} enabled
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={<KeyRound className="h-3.5 w-3.5" />}
                            onClick={() => openPasswordReset(item)}
                          >
                            Password
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleToggleActive(item)}
                          >
                            {item.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={() => setDeleteTarget(item)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Edit Junior Admin" : "Create Junior Admin"}
        description="Profile details and permission toggles. Sensitive settings remain Master Admin only."
        widthClassName="max-w-2xl"
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" isLoading={saving} onClick={requestSave}>
              {editing ? "Save changes" : "Create account"}
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Full name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <Input
              label="Employee ID"
              value={form.employeeCode}
              onChange={(e) => setForm((prev) => ({ ...prev, employeeCode: e.target.value }))}
              hint={editing ? "ID cannot be changed" : "Optional — auto-generated if blank"}
              disabled={Boolean(editing)}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
            {!editing && (
              <Input
                label="Temporary password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                hint="Optional — a secure password is generated if blank"
              />
            )}
          </div>

          <ToggleRow
            label="Account active"
            description="Inactive accounts cannot sign in."
            checked={form.isActive}
            onChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
          />

          <div className="space-y-2 pt-2">
            <h4 className="text-sm font-semibold text-slate-900">Permissions</h4>
            <p className="text-xs text-slate-500">
              Enable only what this Junior Admin needs. All other admin features stay locked.
            </p>
            <div className="space-y-2">
              {ADMIN_PERMISSION_KEYS.map((key) => (
                <ToggleRow
                  key={key}
                  label={ADMIN_PERMISSION_META[key].label}
                  description={ADMIN_PERMISSION_META[key].description}
                  checked={form.permissions[key]}
                  onChange={(checked) => setPermission(key, checked)}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={createConfirmOpen}
        onClose={() => setCreateConfirmOpen(false)}
        title="Create Junior Admin"
        description="Are you sure you want to create this Junior Admin account?"
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setCreateConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" isLoading={saving} onClick={() => void handleSave()}>
              Continue
            </Button>
          </ModalFooterActions>
        }
      >
        <p className="text-sm text-slate-600">
          A new account will be created for <strong>{form.name.trim() || "this user"}</strong> with the
          selected permissions. You will need to enter an email verification code to complete this action.
        </p>
      </Modal>

      <Modal
        open={saveConfirmOpen}
        onClose={() => setSaveConfirmOpen(false)}
        title="Save changes"
        description="Are you sure you want to save these changes?"
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setSaveConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" isLoading={saving} onClick={() => void handleSave()}>
              Save
            </Button>
          </ModalFooterActions>
        }
      >
        <p className="text-sm text-slate-600">
          Updates for <strong>{editing?.name}</strong> will take effect immediately. If permissions changed,
          active sessions for this account will be revoked.
        </p>
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        title="Reset password"
        description={`Set a new password for ${passwordTarget?.name ?? "this Junior Admin"}.`}
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setPasswordTarget(null)}>
              Cancel
            </Button>
            <Button type="button" isLoading={saving} onClick={() => void handleResetPassword()}>
              Reset password
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-4">
          <Input
            label="New password"
            type="text"
            value={passwordForm.password}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
            hint="Leave blank to auto-generate a secure password"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPasswordForm((prev) => ({ ...prev, password: generatePassword() }))}
            >
              Generate password
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget) && otpPurpose !== "junior_admin_delete"}
        onClose={() => setDeleteTarget(null)}
        title="Delete Junior Admin"
        description="This permanently deactivates the account and revokes all sessions."
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" isLoading={saving} onClick={requestDeleteOtp}>
              Continue
            </Button>
          </ModalFooterActions>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.employee_code})? You will need to
          enter an email verification code to complete this action.
        </p>
      </Modal>

      <EmailOtpModal
        open={otpPurpose === "junior_admin_create" || otpPurpose === "junior_admin_delete"}
        purpose={otpPurpose}
        onClose={() => setOtpPurpose(null)}
        onVerified={handleOtpVerified}
      />
    </div>
  );
}
