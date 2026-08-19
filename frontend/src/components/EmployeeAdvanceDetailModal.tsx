import { Fragment, useCallback, useEffect, useState } from "react";
import { Ban, Check, Pencil, Save, Trash2, X } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Input, Select, Textarea, FieldWrapper } from "@/components/ui/Input";
import { InstallmentScheduleEditor } from "@/components/InstallmentScheduleEditor";
import { EmailOtpModal } from "@/components/EmailOtpModal";
import { useAdvanceOtp } from "@/hooks/useAdvanceOtp";
import * as advancePlansApi from "@/api/advancePlans";
import type { AdvancePlanWithSchedule, Installment, PlanStatus, PlanType } from "@/api/advancePlans";
import { extractErrorMessage } from "@/api/client";

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

const STATUS_TONE: Record<PlanStatus, "green" | "amber" | "slate"> = {
  active: "amber",
  completed: "green",
  cancelled: "slate",
};

/** Inline "Record Payment" row, shown under an unpaid/partial installment. */
function RepaymentForm({
  installment,
  employeeId,
  otp,
  onSaved,
  onCancel,
}: {
  installment: Installment;
  employeeId: string;
  otp: ReturnType<typeof useAdvanceOtp>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const remaining = Math.max(0, installment.scheduledAmount - installment.paidAmount);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [entryDate, setEntryDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    otp.runWithOtp("create", employeeId, async (otpFields) => {
      setSaving(true);
      try {
        await advancePlansApi.recordRepayment({
          installmentId: installment.id,
          amount: parsed,
          entryDate,
          note: note.trim() || null,
          ...otpFields,
        });
        onSaved();
      } finally {
        setSaving(false);
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Input
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input label="Date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        <Input
          label="Note"
          placeholder="Optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="col-span-2 sm:col-span-1"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => void submit()} isLoading={saving} icon={<Check className="h-3.5 w-3.5" />}>
          Record Payment
        </Button>
      </div>
    </div>
  );
}

/** Inline edit form for an active plan's principal / schedule. */
function EditPlanForm({
  plan,
  otp,
  onSaved,
  onCancel,
}: {
  plan: AdvancePlanWithSchedule;
  otp: ReturnType<typeof useAdvanceOtp>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const keptInstallments = plan.installments.filter((i) => i.paidAmount > 0);
  const [principalAmount, setPrincipalAmount] = useState(plan.principalAmount.toFixed(2));
  const [planType, setPlanType] = useState<PlanType>(plan.planType);
  const [installmentCount, setInstallmentCount] = useState(
    String(Math.max(1, plan.installmentCount - keptInstallments.length))
  );
  const [customAmounts, setCustomAmounts] = useState<number[]>(
    plan.planType === "custom"
      ? plan.installments.filter((i) => i.paidAmount === 0).map((i) => i.scheduledAmount)
      : []
  );
  const [note, setNote] = useState(plan.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const principal = Number(principalAmount) || 0;
  const alreadyPaid = plan.totalPaid;
  const remaining = Math.max(0, Math.round((principal - alreadyPaid) * 100) / 100);
  const nextStartDate =
    keptInstallments.length > 0
      ? keptInstallments[keptInstallments.length - 1].dueDate
      : plan.startDate;

  function submit() {
    setError(null);
    if (principal < alreadyPaid) {
      setError(`Principal cannot be less than the amount already paid (${formatAmount(alreadyPaid)}).`);
      return;
    }
    if (planType === "custom" && remaining > 0) {
      const sum = Math.round(customAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
      if (sum !== remaining) {
        setError(`Remaining installments must sum to ${remaining.toFixed(2)} (currently ${sum.toFixed(2)}).`);
        return;
      }
    }

    otp.runWithOtp("edit", plan.employeeId, async (otpFields) => {
      setSaving(true);
      try {
        await advancePlansApi.updatePlan(plan.id, {
          principalAmount: principal,
          planType,
          installmentCount:
            planType === "equal_installments" && remaining > 0 ? Number(installmentCount) : undefined,
          installments: planType === "custom" && remaining > 0 ? customAmounts : undefined,
          note: note.trim() || null,
          ...otpFields,
        });
        onSaved();
      } finally {
        setSaving(false);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      {error && <Alert variant="error">{error}</Alert>}
      {keptInstallments.length > 0 && (
        <p className="text-xs text-slate-500">
          {keptInstallments.length} already-paid installment{keptInstallments.length === 1 ? "" : "s"} (
          {formatAmount(alreadyPaid)}) will be kept as-is. Only the schedule below is being changed.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Principal Amount"
          type="number"
          min="0"
          step="0.01"
          value={principalAmount}
          onChange={(e) => setPrincipalAmount(e.target.value)}
        />
        <FieldWrapper label="Repayment Plan" required>
          <Select value={planType} onChange={(e) => setPlanType(e.target.value as PlanType)}>
            <option value="equal_installments">Equal Installments</option>
            <option value="custom">Custom Installments</option>
          </Select>
        </FieldWrapper>
      </div>

      {remaining <= 0 ? (
        <p className="text-sm text-emerald-700">
          New principal is fully covered by what's already been paid — this plan will be marked completed.
        </p>
      ) : planType === "equal_installments" ? (
        <Input
          label={`Remaining ${formatAmount(remaining)} split over how many installments?`}
          type="number"
          min="1"
          step="1"
          value={installmentCount}
          onChange={(e) => setInstallmentCount(e.target.value)}
        />
      ) : (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Remaining installments (must sum to {formatAmount(remaining)})
          </p>
          <InstallmentScheduleEditor
            amounts={customAmounts}
            startDate={nextStartDate}
            principal={remaining}
            onChange={setCustomAmounts}
          />
        </div>
      )}

      <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => void submit()} isLoading={saving} icon={<Save className="h-3.5 w-3.5" />}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  onChanged,
}: {
  plan: AdvancePlanWithSchedule;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [payingInstallmentId, setPayingInstallmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const otp = useAdvanceOtp();

  function handleCancel() {
    setError(null);
    otp.runWithOtp("edit", plan.employeeId, async (otpFields) => {
      setBusy("cancel");
      try {
        await advancePlansApi.cancelPlan(plan.id, otpFields);
        onChanged();
      } finally {
        setBusy(null);
      }
    });
  }

  function handleDelete() {
    setError(null);
    otp.runWithOtp("delete", plan.employeeId, async (otpFields) => {
      setBusy("delete");
      try {
        await advancePlansApi.deletePlan(plan.id, otpFields);
        onChanged();
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              {formatAmount(plan.principalAmount)}
            </span>
            <Badge tone={STATUS_TONE[plan.status]}>
              {plan.status === "active" ? "Active" : plan.status === "completed" ? "Completed" : "Cancelled"}
            </Badge>
            <span className="text-xs text-slate-400">
              {plan.planType === "equal_installments" ? "Equal installments" : "Custom installments"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Started {plan.startDate} · Paid {formatAmount(plan.totalPaid)} · Remaining{" "}
            {formatAmount(plan.remainingBalance)}
          </p>
          {plan.note && <p className="mt-1 text-xs text-slate-500">{plan.note}</p>}
        </div>
        {plan.status === "active" && !editing && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit plan"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {plan.totalPaid === 0 ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy === "delete"}
                title="Delete plan"
                className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={busy === "cancel"}
                title="Cancel plan"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
              >
                <Ban className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {editing ? (
        <div className="mt-3">
          <EditPlanForm
            plan={plan}
            otp={otp}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1 pr-3">Month</th>
                <th className="py-1 pr-3">Scheduled</th>
                <th className="py-1 pr-3">Paid</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.installments.map((inst) => {
                const remaining = Math.max(0, inst.scheduledAmount - inst.paidAmount);
                const paidInFull = remaining <= 0.005 && inst.scheduledAmount > 0;
                return (
                  <Fragment key={inst.id}>
                    <tr>
                      <td className="py-2 pr-3 font-medium text-slate-700">{formatMonth(inst.dueDate)}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">
                        {formatAmount(inst.scheduledAmount)}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-slate-700">{formatAmount(inst.paidAmount)}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={paidInFull ? "green" : inst.paidAmount > 0 ? "amber" : "slate"}>
                          {paidInFull ? "Paid" : inst.paidAmount > 0 ? "Partial" : "Unpaid"}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        {!paidInFull && plan.status === "active" && payingInstallmentId !== inst.id && (
                          <button
                            type="button"
                            onClick={() => setPayingInstallmentId(inst.id)}
                            className="text-xs font-medium text-brand-600 hover:underline"
                          >
                            Record Payment
                          </button>
                        )}
                      </td>
                    </tr>
                    {payingInstallmentId === inst.id && (
                      <tr>
                        <td colSpan={5} className="pb-2">
                          <RepaymentForm
                            installment={inst}
                            employeeId={plan.employeeId}
                            otp={otp}
                            onCancel={() => setPayingInstallmentId(null)}
                            onSaved={() => {
                              setPayingInstallmentId(null);
                              onChanged();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EmailOtpModal
        open={otp.purpose !== null}
        purpose={otp.purpose}
        requestFn={otp.requestFn}
        onClose={otp.close}
        onVerified={otp.onVerified}
      />
    </div>
  );
}

export function EmployeeAdvanceDetailModal({
  open,
  onClose,
  employeeId,
  employeeName,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  employeeName?: string;
  /** Fired after any change so the caller can refresh the overview table. */
  onChanged: () => void;
}) {
  const [plans, setPlans] = useState<AdvancePlanWithSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await advancePlansApi.listPlansForEmployee(employeeId);
      setPlans(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load advance plans."));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function refresh() {
    void load();
    onChanged();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employeeName ? `Advances — ${employeeName}` : "Advances"}
      description="All repayment plans for this employee, oldest active first."
      widthClassName="max-w-3xl"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="secondary" onClick={onClose} icon={<X className="h-4 w-4" />}>
            Close
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading plans…" />
          </div>
        ) : plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No advance plans for this employee yet.</p>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
