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
import { usePermissions } from "@/auth/usePermissions";
import * as advancePlansApi from "@/api/advancePlans";
import type {
  AdvancePaymentMethod,
  AdvancePlanWithSchedule,
  AdvanceRecoveryKind,
  AdvanceStatementTransaction,
  EmployeeAdvanceStatement,
  Installment,
  PlanStatus,
  PlanType,
} from "@/api/advancePlans";
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

const KIND_LABELS: Record<AdvanceRecoveryKind, string> = {
  repayment: "Repayment",
  salary_deduction: "Salary deduction",
  adjustment: "Adjustment",
};

const METHOD_LABELS: Record<AdvancePaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
  salary: "Salary",
  other: "Other",
};

function transactionLabel(row: AdvanceStatementTransaction): string {
  if (row.entryType === "taken") return "Original advance";
  if (row.recoveryKind) return KIND_LABELS[row.recoveryKind];
  return "Repayment";
}

const STATUS_TONE: Record<PlanStatus, "green" | "amber" | "slate"> = {
  active: "amber",
  completed: "green",
  cancelled: "slate",
};

function RecoveryForm({
  plans,
  employeeId,
  remainingBalance,
  otp,
  onSaved,
}: {
  plans: AdvancePlanWithSchedule[];
  employeeId: string;
  remainingBalance: number;
  otp: ReturnType<typeof useAdvanceOtp>;
  onSaved: (result: { totalRecovered: number; remainingBalance: number }) => void;
}) {
  const recoverable = plans.filter((plan) => plan.status === "active" && plan.remainingBalance > 0);
  const [planId, setPlanId] = useState(recoverable[0]?.id ?? "");
  const selected = recoverable.find((plan) => plan.id === planId) ?? recoverable[0];
  const maxAmount = selected?.remainingBalance ?? remainingBalance;
  const [kind, setKind] = useState<AdvanceRecoveryKind>("repayment");
  const [paymentMethod, setPaymentMethod] = useState<AdvancePaymentMethod>("upi");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind === "salary_deduction") setPaymentMethod("salary");
  }, [kind]);

  useEffect(() => {
    if (!selected) return;
    if (planId !== selected.id) setPlanId(selected.id);
  }, [planId, selected]);

  function submit() {
    setError(null);
    if (!selected) {
      setError("No active advance remaining to recover.");
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (parsed > selected.remainingBalance + 0.001) {
      setError(`Recovered amount cannot exceed the remaining balance (${formatAmount(selected.remainingBalance)}).`);
      return;
    }
    otp.runWithOtp("create", employeeId, async (otpFields) => {
      setSaving(true);
      try {
        const result = await advancePlansApi.recordPlanRecovery(selected.id, {
          amount: parsed,
          entryDate,
          kind,
          paymentMethod,
          note: note.trim() || null,
          ...otpFields,
        });
        setAmount("");
        setNote("");
        onSaved({
          totalRecovered: result.totalRecovered,
          remainingBalance: result.remainingBalance,
        });
      } catch (err) {
        setError(extractErrorMessage(err, "Could not save recovery."));
        throw err;
      } finally {
        setSaving(false);
      }
    });
  }

  if (recoverable.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">Record recovery</p>
      {error && <Alert variant="error">{error}</Alert>}
      {recoverable.length > 1 && (
        <FieldWrapper label="Advance" required>
          <Select value={selected.id} onChange={(e) => setPlanId(e.target.value)}>
            {recoverable.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {formatAmount(plan.principalAmount)} · remaining {formatAmount(plan.remainingBalance)}
              </option>
            ))}
          </Select>
        </FieldWrapper>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldWrapper label="Type" required>
          <Select value={kind} onChange={(e) => setKind(e.target.value as AdvanceRecoveryKind)}>
            <option value="repayment">Repayment</option>
            <option value="salary_deduction">Salary deduction</option>
            <option value="adjustment">Reduce remaining balance</option>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Payment method" required>
          <Select
            value={paymentMethod}
            disabled={kind === "salary_deduction"}
            onChange={(e) => setPaymentMethod(e.target.value as AdvancePaymentMethod)}
          >
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <Input
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Remaining ${formatAmount(maxAmount)}`}
        />
        <Input label="Date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </div>
      <Textarea
        label="Notes"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional reference for this recovery"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAmount(maxAmount.toFixed(2))}
        >
          Settle remaining
        </Button>
        <Button type="button" size="sm" onClick={() => void submit()} isLoading={saving} icon={<Check className="h-3.5 w-3.5" />}>
          Save recovery
        </Button>
      </div>
    </div>
  );
}

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
  canRecordRecovery,
  onChanged,
}: {
  plan: AdvancePlanWithSchedule;
  canRecordRecovery: boolean;
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
                        {canRecordRecovery &&
                          !paidInFull &&
                          plan.status === "active" &&
                          payingInstallmentId !== inst.id && (
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
  const { isMasterAdmin } = usePermissions();
  const otp = useAdvanceOtp();
  const [statement, setStatement] = useState<EmployeeAdvanceStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await advancePlansApi.getEmployeeStatement(employeeId);
      setStatement(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load advance history."));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (open) {
      setMessage(null);
      void load();
    }
  }, [open, load]);

  function refresh() {
    void load();
    onChanged();
  }

  const originalAdvance = statement?.originalAdvance ?? 0;
  const totalRecovered = statement?.totalRecovered ?? 0;
  const remainingBalance = statement?.remainingBalance ?? 0;
  const plans = statement?.plans ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employeeName ? `Advances — ${employeeName}` : "Advances"}
      description="Original advance, recoveries, remaining balance, and full transaction history."
      widthClassName="max-w-4xl"
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
        {message && <Alert variant="success">{message}</Alert>}
        {loading && !statement ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading history…" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  { label: "Original Advance", value: originalAdvance, tone: "text-slate-900" },
                  { label: "Total Recovered", value: totalRecovered, tone: "text-emerald-700" },
                  { label: "Remaining Balance", value: remainingBalance, tone: "text-amber-700" },
                ] as const
              ).map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${item.tone}`}>
                    {formatAmount(item.value)}
                  </p>
                </div>
              ))}
            </div>

            {isMasterAdmin && employeeId && (
              <RecoveryForm
                plans={plans}
                employeeId={employeeId}
                remainingBalance={remainingBalance}
                otp={otp}
                onSaved={(result) => {
                  setMessage(
                    `Saved. Total recovered ${formatAmount(result.totalRecovered)} · remaining ${formatAmount(result.remainingBalance)}.`
                  );
                  refresh();
                }}
              />
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Transaction History</p>
              {!statement || statement.transactions.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">No advance transactions yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Method</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statement.transactions.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.entryDate}</td>
                          <td className="px-3 py-2 text-slate-800">{transactionLabel(row)}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {row.paymentMethod ? METHOD_LABELS[row.paymentMethod] : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${
                              row.entryType === "taken" ? "text-amber-700" : "text-emerald-700"
                            }`}
                          >
                            {row.entryType === "taken" ? "+" : "−"}
                            {formatAmount(row.amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                            {formatAmount(row.runningBalance)}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{row.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {plans.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-800">Repayment plans</p>
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    canRecordRecovery={isMasterAdmin}
                    onChanged={refresh}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <EmailOtpModal
        open={otp.purpose !== null}
        purpose={otp.purpose}
        requestFn={otp.requestFn}
        onClose={otp.close}
        onVerified={otp.onVerified}
      />
    </Modal>
  );
}
