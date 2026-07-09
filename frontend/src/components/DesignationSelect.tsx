import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import * as employeesApi from "@/api/employees";
import { extractErrorMessage } from "@/api/client";
import type { EmployeeDesignation } from "@/types";
import {
  DESIGNATIONS_CHANGED_EVENT,
  notifyDesignationsChanged,
} from "@/utils/designationEvents";

const CUSTOM_VALUE = "__custom__";

export function DesignationSelect({
  value,
  onChange,
  required,
  label = "Role / Designation",
  error,
  allowEmpty,
  allowCustom = true,
  emptyLabel = "All roles",
  className,
}: {
  value: string;
  onChange: (designationId: string) => void;
  required?: boolean;
  label?: string;
  error?: string;
  allowEmpty?: boolean;
  allowCustom?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const [items, setItems] = useState<EmployeeDesignation[]>([]);
  const [loading, setLoading] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeesApi.fetchDesignations();
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onChanged() {
      void load();
    }
    window.addEventListener(DESIGNATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DESIGNATIONS_CHANGED_EVENT, onChanged);
  }, [load]);

  async function handleCreateCustom() {
    const name = customName.trim();
    if (name.length < 2) {
      setCustomError("Enter a role name with at least 2 characters.");
      return;
    }
    setSaving(true);
    setCustomError(null);
    try {
      const created = await employeesApi.createDesignation(name);
      notifyDesignationsChanged();
      await load();
      onChange(created.id);
      setCustomOpen(false);
      setCustomName("");
    } catch (err) {
      setCustomError(extractErrorMessage(err, "Could not create role"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Select
        label={label}
        required={required}
        value={value}
        error={error}
        className={className}
        disabled={loading}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM_VALUE) {
            setCustomOpen(true);
            return;
          }
          onChange(next);
        }}
        hint={
          loading
            ? "Loading roles…"
            : allowCustom
              ? "Select a role, or choose Custom Role to add a new one."
              : undefined
        }
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {!allowEmpty && !value && <option value="">Select a role…</option>}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
        {allowCustom && <option value={CUSTOM_VALUE}>Custom Role…</option>}
      </Select>

      <Modal
        open={customOpen}
        onClose={() => {
          if (saving) return;
          setCustomOpen(false);
          setCustomError(null);
          setCustomName("");
        }}
        title="Add custom role"
        description="The new role will be saved and available for all future employees."
        widthClassName="max-w-md"
        footer={
          <ModalFooterActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCustomOpen(false);
                setCustomError(null);
                setCustomName("");
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateCustom()}
              isLoading={saving}
              icon={<Plus className="h-4 w-4" />}
            >
              Save role
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-3">
          {customError && <Alert variant="error">{customError}</Alert>}
          <Input
            label="Role name"
            required
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. Project Manager"
            maxLength={100}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
