import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { Input, Select, Textarea, FieldWrapper } from "@/components/ui/Input";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import * as advancesApi from "@/api/advances";
import type { AdvanceEntry, AdvanceEntryType } from "@/api/advances";
import { extractErrorMessage } from "@/api/client";

const TYPE_OPTIONS: { value: AdvanceEntryType; label: string }[] = [
  { value: "taken", label: "Taken (employee received money)" },
  { value: "returned", label: "Returned (employee repaid)" },
];

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Admin-only ledger for money the company has advanced to an employee.
 * Balance owed = sum(taken) − sum(returned), recomputed by the server on every write.
 */
export function AdvanceEntryModal({
  open,
  onClose,
  initialEmployeeId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialEmployeeId?: string;
  /** Fired after any successful write so the caller can refresh its own totals. */
  onSaved?: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [entries, setEntries] = useState<AdvanceEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [totals, setTotals] = useState({ taken: 0, returned: 0 });

  const [entryDate, setEntryDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [entryType, setEntryType] = useState<AdvanceEntryType>("taken");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLedger = useCallback(async (id: string) => {
    if (!id) {
      setEntries([]);
      setBalance(0);
      setTotals({ taken: 0, returned: 0 });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await advancesApi.listAdvances({ employeeId: id });
      setEntries(data.entries);
      setBalance(data.balance);
      setTotals(data.totals);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load advance entries."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setEmployeeId(initialEmployeeId ?? "");
    setEntryDate(todayStr());
    setAmount("");
    setEntryType("taken");
    setNote("");
    setError(null);
  }, [open, initialEmployeeId]);

  useEffect(() => {
    if (!open) return;
    void loadLedger(employeeId);
  }, [open, employeeId, loadLedger]);

  async function handleAdd() {
    setError(null);
    if (!employeeId) {
      setError("Select an employee first.");
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!entryDate) {
      setError("Select a date for this entry.");
      return;
    }

    setSaving(true);
    try {
      await advancesApi.createAdvance({
        employeeId,
        entryDate,
        amount: parsed,
        entryType,
        note: note.trim() || null,
      });
      setAmount("");
      setNote("");
      await loadLedger(employeeId);
      onSaved?.();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the advance entry."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      await advancesApi.deleteAdvance(id);
      await loadLedger(employeeId);
      onSaved?.();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not delete the entry."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Employee Advances"
      description="Record money the company advanced to this employee and any repayments. The balance is what they currently owe."
      widthClassName="max-w-3xl"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <EmployeeCombobox label="Employee" value={employeeId} onChange={setEmployeeId} />

        {employeeId && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Total taken
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {formatAmount(totals.taken)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Total returned
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {formatAmount(totals.returned)}
              </p>
            </div>
            <div
              className={`rounded-lg border px-3 py-2 ${
                balance > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Balance owed
              </p>
              <p
                className={`mt-0.5 text-sm font-semibold ${
                  balance > 0 ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                {formatAmount(balance)}
              </p>
            </div>
          </div>
        )}

        {employeeId && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Wallet className="h-4 w-4" />
              Add entry
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FieldWrapper label="Type" required>
                <Select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as AdvanceEntryType)}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FieldWrapper>
              <Input
                label="Amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Input
                label="Date"
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <Textarea
              label="Note"
              rows={2}
              placeholder="Optional — why this advance was given or repaid"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleAdd()}
                isLoading={saving}
                icon={<Plus className="h-4 w-4" />}
              >
                Add Entry
              </Button>
            </div>
          </div>
        )}

        {employeeId && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-900">History</p>
            {loading ? (
              <div className="flex justify-center py-6">
                <Spinner label="Loading entries…" />
              </div>
            ) : entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No advance entries for this employee yet.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      {["Date", "Type", "Amount", "Note", ""].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium text-slate-600">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-3 py-2 font-medium text-slate-700">{entry.entryDate}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              entry.entryType === "taken" ? "text-amber-700" : "text-emerald-700"
                            }
                          >
                            {entry.entryType === "taken" ? "Taken" : "Returned"}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{formatAmount(entry.amount)}</td>
                        <td className="px-3 py-2 text-slate-500">{entry.note ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDelete(entry.id)}
                            disabled={deletingId === entry.id}
                            title="Delete entry"
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
