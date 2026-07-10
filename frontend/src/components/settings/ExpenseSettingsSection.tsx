import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import type { ExpenseSettings } from "@/types/settings";

function validateExpenseForm(form: ExpenseSettings): string | null {
  if (!form.cycles.weekly && !form.cycles.monthly && !form.cycles.custom) {
    return "Enable at least one reimbursement cycle (weekly, monthly, or custom).";
  }
  if (!form.categories.some((item) => item.enabled)) {
    return "Enable at least one expense category.";
  }
  if (!form.paymentMethods.some((item) => item.enabled)) {
    return "Enable at least one payment method.";
  }
  if (form.maxAmountPerRequest < form.maxAmountPerExpense) {
    return "Max amount per request must be at least the max amount per expense.";
  }
  return null;
}

export function ExpenseSettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<ExpenseSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      setForm(settings.expenses);
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load expense settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function requestSave() {
    if (!form) return;
    const validationError = validateExpenseForm(form);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirmSave() {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.updateSettingsCategory("expenses", form);
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Expense settings saved successfully." });
      showToast("Settings saved successfully.");
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Could not save expense settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <Spinner label="Loading expense settings…" />;
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === "success" ? "success" : "error"}>{message.text}</Alert>
      )}

      <SettingsSection
        title="Reimbursement cycles"
        description="Choose which period types Junior Admins can use when requesting reimbursement. At least one must stay enabled."
      >
        <ToggleRow
          label="Weekly"
          description="Submit expenses for the current or selected week."
          checked={form.cycles.weekly}
          onChange={(checked) =>
            setForm((prev) => prev && { ...prev, cycles: { ...prev.cycles, weekly: checked } })
          }
        />
        <ToggleRow
          label="Monthly"
          description="Submit expenses for a calendar month."
          checked={form.cycles.monthly}
          onChange={(checked) =>
            setForm((prev) => prev && { ...prev, cycles: { ...prev.cycles, monthly: checked } })
          }
        />
        <ToggleRow
          label="Custom date range"
          description="Allow a custom from/to date range."
          checked={form.cycles.custom}
          onChange={(checked) =>
            setForm((prev) => prev && { ...prev, cycles: { ...prev.cycles, custom: checked } })
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Approval rules"
        description="Control how reimbursement requests are reviewed and archived."
      >
        <ToggleRow
          label="Approval required"
          description="When off, submitted requests are auto-approved and ready for payment."
          checked={form.approvalRequired}
          onChange={(checked) => setForm((prev) => prev && { ...prev, approvalRequired: checked })}
        />
        <Input
          label="Auto-archive paid requests (days)"
          type="number"
          min={0}
          max={3650}
          hint="0 archives immediately when marked paid. Any higher value archives paid requests after that many days."
          value={form.autoArchivePaidDays}
          onChange={(e) =>
            setForm((prev) =>
              prev ? { ...prev, autoArchivePaidDays: Math.max(0, Number(e.target.value) || 0) } : prev
            )
          }
        />
        <Input
          label="Receipt required above (₹)"
          type="number"
          min={0}
          hint="0 disables the receipt requirement. Higher values require a receipt for expenses at or above that amount."
          value={form.requireReceiptAbove}
          onChange={(e) =>
            setForm((prev) =>
              prev ? { ...prev, requireReceiptAbove: Math.max(0, Number(e.target.value) || 0) } : prev
            )
          }
        />
        <Input
          label="Max amount per expense (₹)"
          type="number"
          min={1}
          value={form.maxAmountPerExpense}
          onChange={(e) =>
            setForm((prev) =>
              prev
                ? { ...prev, maxAmountPerExpense: Math.max(1, Number(e.target.value) || 1) }
                : prev
            )
          }
        />
        <Input
          label="Max amount per request (₹)"
          type="number"
          min={1}
          value={form.maxAmountPerRequest}
          onChange={(e) =>
            setForm((prev) =>
              prev
                ? { ...prev, maxAmountPerRequest: Math.max(1, Number(e.target.value) || 1) }
                : prev
            )
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Expense categories"
        description="Enable or disable categories available when recording expenses. At least one must stay enabled."
      >
        <div className="space-y-2">
          {form.categories.map((item, index) => (
            <ToggleRow
              key={item.key}
              label={item.label}
              checked={item.enabled}
              onChange={(checked) =>
                setForm((prev) => {
                  if (!prev) return prev;
                  const categories = [...prev.categories];
                  categories[index] = { ...categories[index], enabled: checked };
                  return { ...prev, categories };
                })
              }
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Payment methods"
        description="Enable or disable payment methods for expense entries. At least one must stay enabled."
      >
        <div className="space-y-2">
          {form.paymentMethods.map((item, index) => (
            <ToggleRow
              key={item.key}
              label={item.label}
              checked={item.enabled}
              onChange={(checked) =>
                setForm((prev) => {
                  if (!prev) return prev;
                  const paymentMethods = [...prev.paymentMethods];
                  paymentMethods[index] = { ...paymentMethods[index], enabled: checked };
                  return { ...prev, paymentMethods };
                })
              }
            />
          ))}
        </div>
      </SettingsSection>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={requestSave} isLoading={saving}>
          Save expense settings
        </Button>
      </div>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        onCancel={() => {
          if (!saving) setConfirmOpen(false);
        }}
        onConfirm={handleConfirmSave}
        title="Save changes?"
        message="Are you sure you want to save these changes?"
        confirmLabel="Save"
      />
    </div>
  );
}
