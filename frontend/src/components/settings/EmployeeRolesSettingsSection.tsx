import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection } from "@/components/settings/SettingsSection";
import * as employeesApi from "@/api/employees";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import type { EmployeeDesignation } from "@/types";
import { notifyDesignationsChanged } from "@/utils/designationEvents";

type Message = { type: "success" | "error"; text: string };

export function EmployeeRolesSettingsSection() {
  const { refresh } = useSettings();
  const [items, setItems] = useState<EmployeeDesignation[]>([]);
  const [defaultDesignationId, setDefaultDesignationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeDesignation | null>(null);
  const [roleName, setRoleName] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [designations, settings] = await Promise.all([
        employeesApi.fetchDesignations(),
        settingsApi.fetchSettings(),
      ]);
      setItems(designations.items);
      setDefaultDesignationId(
        settings.employee.defaultDesignationId ?? designations.defaultDesignationId ?? null
      );
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load employee roles."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function afterMutation(successText: string) {
    setMessage({ type: "success", text: successText });
    await load();
    notifyDesignationsChanged();
    await refresh();
  }

  function openCreate() {
    setEditing(null);
    setRoleName("");
    setEditorError(null);
    setEditorOpen(true);
  }

  function openEdit(item: EmployeeDesignation) {
    setEditing(item);
    setRoleName(item.name);
    setEditorError(null);
    setEditorOpen(true);
  }

  async function handleSaveRole() {
    const name = roleName.trim();
    if (name.length < 2) {
      setEditorError("Enter a role name with at least 2 characters.");
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      if (editing) {
        await employeesApi.updateDesignation(editing.id, name);
        setEditorOpen(false);
        await afterMutation(`Role “${name}” updated.`);
      } else {
        await employeesApi.createDesignation(name);
        setEditorOpen(false);
        await afterMutation(`Role “${name}” added.`);
      }
    } catch (err) {
      setEditorError(extractErrorMessage(err, "Could not save role"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: EmployeeDesignation) {
    if (
      !window.confirm(
        `Delete role “${item.name}”? This is only allowed if no employees are assigned to it.`
      )
    ) {
      return;
    }
    setBusyId(item.id);
    setMessage(null);
    try {
      await employeesApi.deleteDesignation(item.id);
      await afterMutation(`Role “${item.name}” deleted.`);
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Could not delete role"),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetDefault(id: string | null) {
    setBusyId(id ?? "__none__");
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      await settingsApi.updateEmployeeSettings({
        ...settings.employee,
        defaultDesignationId: id,
      });
      setDefaultDesignationId(id);
      notifyDesignationsChanged();
      await refresh();
      setMessage({
        type: "success",
        text: id
          ? "Default role for new employees updated."
          : "Default role cleared. Admins must pick a role when creating employees.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Could not update default role"),
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SettingsSection
        title="Employee Roles"
        description="Job roles / designations used in Add/Edit Employee. These are separate from login permissions (admin vs employee)."
      >
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
            Add role
          </Button>
        </div>

        {message && (
          <Alert variant={message.type === "error" ? "error" : "success"}>
            {message.text}
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading roles…" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No roles yet. Add a role to get started.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Default</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((item) => {
                  const isDefault = defaultDesignationId === item.id;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {item.name}
                        {item.is_system && (
                          <span className="ml-2 text-xs font-normal text-slate-400">Seeded</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isDefault ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                            <Star className="h-3 w-3" />
                            Default
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId !== null}
                            onClick={() => void handleSetDefault(item.id)}
                          >
                            Set as default
                          </Button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${item.name}`}
                            disabled={busyId !== null}
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${item.name}`}
                            disabled={busyId === item.id}
                            isLoading={busyId === item.id}
                            onClick={() => void handleDelete(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

        {defaultDesignationId && (
          <p className="mt-3 text-xs text-slate-500">
            New employees will pre-select this role in Add Employee.{" "}
            <button
              type="button"
              className="font-medium text-slate-700 underline-offset-2 hover:underline"
              disabled={busyId !== null}
              onClick={() => void handleSetDefault(null)}
            >
              Clear default
            </button>
          </p>
        )}
      </SettingsSection>

      <Modal
        open={editorOpen}
        onClose={() => {
          if (saving) return;
          setEditorOpen(false);
        }}
        title={editing ? "Edit role" : "Add role"}
        description="Roles appear in the Role / Designation dropdown when creating or editing employees."
        widthClassName="max-w-md"
        footer={
          <ModalFooterActions>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveRole()} isLoading={saving}>
              {editing ? "Save changes" : "Add role"}
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-3">
          {editorError && <Alert variant="error">{editorError}</Alert>}
          <Input
            label="Role name"
            required
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g. Project Manager"
            maxLength={100}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
