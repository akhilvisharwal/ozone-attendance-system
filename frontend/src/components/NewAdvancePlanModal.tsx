import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input, Select, Textarea, FieldWrapper } from "@/components/ui/Input";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import { InstallmentScheduleEditor } from "@/components/InstallmentScheduleEditor";
import * as advancePlansApi from "@/api/advancePlans";
import type { PlanType } from "@/api/advancePlans";
import { extractErrorMessage } from "@/api/client";

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function splitEqual(principal: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor((principal / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  amounts[count - 1] = Math.round((principal - base * (count - 1)) * 100) / 100;
  return amounts;
}

export function NewAdvancePlanModal({
  open,
  onClose,
  initialEmployeeId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialEmployeeId?: string;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [planType, setPlanType] = useState<PlanType>("equal_installments");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [customAmounts, setCustomAmounts] = useState<number[]>([0]);
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(initialEmployeeId ?? "");
    setPrincipalAmount("");
    setStartDate(todayStr());
    setPlanType("equal_installments");
    setInstallmentCount("1");
    setCustomAmounts([0]);
    setNote("");
    setError(null);
  }, [open, initialEmployeeId]);

  const principal = Number(principalAmount) || 0;
  const count = Number(installmentCount) || 0;
  const equalPreview = planType === "equal_installments" && principal > 0 && count > 0
    ? splitEqual(principal, count)
    : [];

  async function handleSubmit() {
    setError(null);
    if (!employeeId) {
      setError("Select an employee.");
      return;
    }
    if (principal <= 0) {
      setError("Enter a principal amount greater than zero.");
      return;
    }
    if (!startDate) {
      setError("Select a start date.");
      return;
    }
    if (planType === "equal_installments" && count < 1) {
      setError("Enter at least one installment.");
      return;
    }
    if (planType === "custom") {
      const sum = Math.round(customAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
      const target = Math.round(principal * 100) / 100;
      if (sum !== target) {
        setError(`Installments must sum to ${target.toFixed(2)} (currently ${sum.toFixed(2)}).`);
        return;
      }
    }

    setSaving(true);
    try {
      await advancePlansApi.createPlan({
        employeeId,
        principalAmount: principal,
        startDate,
        planType,
        installmentCount: planType === "equal_installments" ? count : undefined,
        installments: planType === "custom" ? customAmounts : undefined,
        note: note.trim() || null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create the advance plan."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Advance"
      description="Record money advanced to an employee, and how it will be repaid."
      widthClassName="max-w-2xl"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} isLoading={saving} icon={<Save className="h-4 w-4" />}>
            Create Advance
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <EmployeeCombobox label="Employee" value={employeeId} onChange={setEmployeeId} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Principal Amount"
            type="number"
            min="0"
            step="0.01"
            required
            value={principalAmount}
            onChange={(e) => setPrincipalAmount(e.target.value)}
          />
          <Input
            label="Start Date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <FieldWrapper label="Repayment Plan" required>
          <Select
            value={planType}
            onChange={(e) => setPlanType(e.target.value as PlanType)}
          >
            <option value="equal_installments">Equal Installments</option>
            <option value="custom">Custom Installments</option>
          </Select>
        </FieldWrapper>

        {planType === "equal_installments" ? (
          <div className="space-y-2">
            <Input
              label="Number of Installments"
              type="number"
              min="1"
              step="1"
              required
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
            />
            {equalPreview.length > 0 && (
              <p className="text-xs text-slate-500">
                {equalPreview.length} monthly installment{equalPreview.length === 1 ? "" : "s"} of{" "}
                {equalPreview[0].toFixed(2)}
                {equalPreview.length > 1 && equalPreview[equalPreview.length - 1] !== equalPreview[0] && (
                  <> (last: {equalPreview[equalPreview.length - 1].toFixed(2)})</>
                )}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Installment Schedule</p>
            <InstallmentScheduleEditor
              amounts={customAmounts}
              startDate={startDate}
              principal={principal}
              onChange={setCustomAmounts}
            />
          </div>
        )}

        <Textarea
          label="Note"
          rows={2}
          placeholder="Optional — why this advance was given"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
