import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { Download, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { ReceiptThumbnail } from "@/components/ReceiptThumbnail";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { staggerContainer, staggerItem } from "@/lib/motion";
import * as expensesApi from "@/api/expenses";
import { extractErrorMessage } from "@/api/client";
import type {
  Expense,
  ExpenseReimbursementRequest,
  ExpenseWeekGroup,
  ReimbursementPeriodType,
} from "@/types";
import type { ExpenseSettings } from "@/types/settings";
import { formatDate } from "@/utils/format";

type TabId = "drafts" | "pending" | "history";

type ExpenseOptions = Pick<
  ExpenseSettings,
  | "cycles"
  | "categories"
  | "paymentMethods"
  | "maxAmountPerExpense"
  | "maxAmountPerRequest"
  | "requireReceiptAbove"
  | "approvalRequired"
>;

const FALLBACK_OPTIONS: ExpenseOptions = {
  cycles: { weekly: true, monthly: true, custom: true },
  categories: [
    { key: "travel", label: "Travel", enabled: true },
    { key: "food", label: "Food", enabled: true },
    { key: "material", label: "Material", enabled: true },
    { key: "fuel", label: "Fuel", enabled: true },
    { key: "miscellaneous", label: "Miscellaneous", enabled: true },
    { key: "other", label: "Other", enabled: true },
  ],
  paymentMethods: [
    { key: "cash", label: "Cash", enabled: true },
    { key: "upi", label: "UPI", enabled: true },
    { key: "bank_transfer", label: "Bank Transfer", enabled: true },
    { key: "card", label: "Card", enabled: true },
    { key: "other", label: "Other", enabled: true },
  ],
  maxAmountPerExpense: 100_000,
  maxAmountPerRequest: 500_000,
  requireReceiptAbove: 0,
  approvalRequired: true,
};

function formatMoney(amount: number | string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function statusTone(status: string): "amber" | "green" | "red" | "slate" | "blue" {
  if (status === "approved" || status === "paid") return "green";
  if (status === "rejected") return "red";
  if (status === "pending" || status === "pending_approval") return "amber";
  if (status === "archived") return "slate";
  if (status === "draft") return "blue";
  return "slate";
}

function requestStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function periodLabel(request: ExpenseReimbursementRequest): string {
  if (request.period_type === "weekly") {
    return `Week ${formatDate(request.period_start)} – ${formatDate(request.period_end)}`;
  }
  if (request.period_type === "monthly") {
    return `Month ${request.period_start.slice(0, 7)}`;
  }
  return `${formatDate(request.period_start)} – ${formatDate(request.period_end)}`;
}

function currentWeekRange(): { from: string; to: string } {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (d: Date) => d.toISOString().slice(0, 10);
  return { from: pad(monday), to: pad(sunday) };
}

function currentMonthRange(): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

type FormState = {
  expenseDate: string;
  amount: string;
  paymentMethod: string;
  category: string;
  description: string;
  receipt: File | null;
  clearReceipt: boolean;
};

function emptyForm(settings: ExpenseOptions | null): FormState {
  const paymentMethod =
    settings?.paymentMethods.find((item) => item.enabled)?.key ??
    settings?.paymentMethods[0]?.key ??
    "upi";
  const category =
    settings?.categories.find((item) => item.enabled)?.key ??
    settings?.categories[0]?.key ??
    "miscellaneous";
  return {
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentMethod,
    category,
    description: "",
    receipt: null,
    clearReceipt: false,
  };
}

export function ExpenseTrackerPage() {
  const [tab, setTab] = useState<TabId>("drafts");
  const [weeks, setWeeks] = useState<ExpenseWeekGroup[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ExpenseReimbursementRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<ExpenseReimbursementRequest[]>([]);
  const [historyExpenses, setHistoryExpenses] = useState<Expense[]>([]);
  const [expenseSettings, setExpenseSettings] = useState<ExpenseOptions>(FALLBACK_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(FALLBACK_OPTIONS));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestPeriod, setRequestPeriod] = useState<ReimbursementPeriodType>("weekly");
  const [requestFrom, setRequestFrom] = useState("");
  const [requestTo, setRequestTo] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "excel">("pdf");
  const [exportPeriod, setExportPeriod] = useState<ReimbursementPeriodType>("monthly");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const paymentMethods = useMemo(
    () =>
      expenseSettings.paymentMethods.filter((item) => item.enabled).length > 0
        ? expenseSettings.paymentMethods.filter((item) => item.enabled)
        : FALLBACK_OPTIONS.paymentMethods,
    [expenseSettings]
  );
  const categories = useMemo(
    () =>
      expenseSettings.categories.filter((item) => item.enabled).length > 0
        ? expenseSettings.categories.filter((item) => item.enabled)
        : FALLBACK_OPTIONS.categories,
    [expenseSettings]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [options, draftData, requestData, historyData] = await Promise.all([
        expensesApi.getExpenseOptions(),
        expensesApi.listMyExpenses({ view: "drafts" }),
        expensesApi.listMyRequests(),
        expensesApi.listMyExpenses({ view: "history" }),
      ]);
      setExpenseSettings({
        cycles: options.cycles,
        categories: options.categories,
        paymentMethods: options.paymentMethods,
        maxAmountPerExpense: options.maxAmountPerExpense,
        maxAmountPerRequest: options.maxAmountPerRequest,
        requireReceiptAbove: options.requireReceiptAbove,
        approvalRequired: options.approvalRequired,
      });
      setWeeks(draftData.weeks);
      setPendingRequests(
        requestData.requests.filter(
          (row) => row.status === "pending_approval" || row.status === "approved"
        )
      );
      setHistoryRequests(
        requestData.requests.filter(
          (row) => row.status === "paid" || row.status === "archived" || row.status === "rejected"
        )
      );
      setHistoryExpenses(historyData.items);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load expenses."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(expenseSettings));
    setEditorOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setForm({
      expenseDate: expense.expense_date,
      amount: expense.amount,
      paymentMethod: expense.payment_method,
      category: expense.category,
      description: expense.description ?? "",
      receipt: null,
      clearReceipt: false,
    });
    setEditorOpen(true);
  }

  function openRequestModal() {
    const week = currentWeekRange();
    const month = currentMonthRange();
    setRequestPeriod("weekly");
    setRequestFrom(week.from);
    setRequestTo(week.to);
    setExportFrom(month.from);
    setExportTo(month.to);
    setRequestOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.expenseDate || !(amount > 0)) {
      setError("Enter a valid date and amount.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        expenseDate: form.expenseDate,
        amount,
        paymentMethod: form.paymentMethod,
        category: form.category,
        description: form.description.trim() || null,
        receipt: form.receipt,
        clearReceipt: form.clearReceipt,
      };
      if (editing) {
        await expensesApi.updateMyExpense(editing.id, payload);
        setMessage("Expense updated.");
      } else {
        await expensesApi.createMyExpense(payload);
        setMessage("Expense added.");
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save expense."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await expensesApi.deleteMyExpense(deleteTarget.id);
      setMessage("Expense deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not delete expense."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitRequest() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: { periodType: ReimbursementPeriodType; from?: string; to?: string } = {
        periodType: requestPeriod,
      };
      if (requestPeriod === "weekly") {
        payload.from = requestFrom || currentWeekRange().from;
      } else if (requestPeriod === "monthly") {
        payload.from = requestFrom || currentMonthRange().from;
      } else {
        if (!requestFrom || !requestTo) {
          setError("Select a custom date range.");
          setSaving(false);
          return;
        }
        payload.from = requestFrom;
        payload.to = requestTo;
      }
      await expensesApi.submitReimbursementRequest(payload);
      setMessage(
        expenseSettings.approvalRequired
          ? "Reimbursement request submitted. Expenses are now locked pending approval."
          : "Reimbursement request submitted and auto-approved. Waiting for payment."
      );
      setRequestOpen(false);
      setTab("pending");
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not submit reimbursement request."));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const params: {
        format: "pdf" | "excel";
        period: ReimbursementPeriodType;
        from?: string;
        to?: string;
      } = { format: exportFormat, period: exportPeriod };
      if (exportPeriod === "weekly") {
        params.from = exportFrom || currentWeekRange().from;
      } else if (exportPeriod === "monthly") {
        params.from = exportFrom || currentMonthRange().from;
      } else if (exportFrom && exportTo) {
        params.from = exportFrom;
        params.to = exportTo;
      }
      await expensesApi.exportExpenseReport(params);
      setExportOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not export report."));
    } finally {
      setExporting(false);
    }
  }

  const draftCount = weeks.reduce((sum, week) => sum + week.expenses.length, 0);
  const enabledCycles = expenseSettings.cycles;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Expense Tracker"
        subtitle="Record company expenses, submit reimbursement requests, and track payment history."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              onClick={() => setExportOpen(true)}
            >
              Export
            </Button>
            {tab === "drafts" && draftCount > 0 && (
              <Button icon={<Send className="h-4 w-4" />} onClick={openRequestModal}>
                Request Reimbursement
              </Button>
            )}
            {tab === "drafts" && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                Add Expense
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "drafts" as const, label: "Drafts", count: draftCount },
            { id: "pending" as const, label: "Pending", count: pendingRequests.length },
            { id: "history" as const, label: "Payment History", count: historyRequests.length },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={clsx(
              "min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0",
              tab === item.id
                ? "bg-brand-50 text-brand-700"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {item.label}
            {item.count > 0 && (
              <span className="ml-1.5 text-xs text-slate-500">({item.count})</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      )}

      <CrossfadeSwitch state={loading ? "loading" : tab}>
        {loading ? (
          <ContentSkeleton />
        ) : tab === "drafts" ? (
          weeks.length === 0 ? (
            <EmptyState
              title="No draft expenses"
              description="Add company expenses you paid on behalf of the company. Submit them as a reimbursement request when ready."
            />
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
              {weeks.map((week) => (
                <motion.div key={`${week.employeeId}-${week.weekStart}`} variants={staggerItem}>
                  <Card className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Week {formatDate(week.weekStart)} – {formatDate(week.weekEnd)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {week.expenses.length} entr{week.expenses.length === 1 ? "y" : "ies"} · Total{" "}
                          {formatMoney(week.totalAmount)}
                        </p>
                      </div>
                      <Badge tone="blue">Draft</Badge>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {week.expenses.map((expense) => (
                        <ExpenseRow
                          key={expense.id}
                          expense={expense}
                          categories={categories}
                          paymentMethods={paymentMethods}
                          editable
                          onEdit={() => openEdit(expense)}
                          onDelete={() => setDeleteTarget(expense)}
                        />
                      ))}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )
        ) : tab === "pending" ? (
          pendingRequests.length === 0 ? (
            <EmptyState
              title="No pending requests"
              description="Submitted reimbursement requests awaiting approval or payment will appear here."
            />
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
              {pendingRequests.map((request) => (
                <motion.div key={request.id} variants={staggerItem}>
                  <RequestCard
                    request={request}
                    categories={categories}
                    paymentMethods={paymentMethods}
                  />
                </motion.div>
              ))}
            </motion.div>
          )
        ) : historyRequests.length === 0 ? (
          <EmptyState
            title="No payment history"
            description="Paid, archived, and rejected reimbursement requests will appear here."
          />
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
            {historyRequests.map((request) => (
              <motion.div key={request.id} variants={staggerItem}>
                <RequestCard
                  request={request}
                  expenses={historyExpenses.filter((row) => row.request_id === request.id)}
                  categories={categories}
                  paymentMethods={paymentMethods}
                  showPaymentInfo
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </CrossfadeSwitch>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Edit Expense" : "Add Expense"}
        description="Enter details for a company expense you paid."
        widthClassName="max-w-lg"
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="expense-form" isLoading={saving}>
              {editing ? "Save changes" : "Add expense"}
            </Button>
          </ModalFooterActions>
        }
      >
        <form id="expense-form" className="space-y-3" onSubmit={(e) => void handleSave(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              required
              value={form.expenseDate}
              onChange={(e) => setForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
            />
            <Input
              label="Amount (₹)"
              type="number"
              min={0.01}
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
            />
            <Select
              label="Payment method"
              value={form.paymentMethod}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
            >
              {paymentMethods.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              {categories.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="Description / notes"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <Input
            label="Receipt (image or PDF, optional)"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                receipt: e.target.files?.[0] ?? null,
                clearReceipt: false,
              }))
            }
          />
          {editing?.receipt_path && !form.receipt && !form.clearReceipt && (
            <div className="flex items-center gap-3">
              <ReceiptThumbnail path={editing.receipt_path} sizeClassName="h-16 w-16" />
              <button
                type="button"
                className="text-xs font-medium text-red-600 hover:underline"
                onClick={() => setForm((prev) => ({ ...prev, clearReceipt: true }))}
              >
                Remove current receipt
              </button>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request Reimbursement"
        description="Submit draft expenses for the selected period. They will be locked and sent for approval."
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button type="button" isLoading={saving} onClick={() => void handleSubmitRequest()}>
              Submit request
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-3">
          <Select
            label="Period"
            value={requestPeriod}
            onChange={(e) => {
              const next = e.target.value as ReimbursementPeriodType;
              setRequestPeriod(next);
              if (next === "weekly") {
                const range = currentWeekRange();
                setRequestFrom(range.from);
                setRequestTo(range.to);
              } else if (next === "monthly") {
                const range = currentMonthRange();
                setRequestFrom(range.from);
                setRequestTo(range.to);
              }
            }}
          >
            {enabledCycles?.weekly !== false && <option value="weekly">Weekly</option>}
            {enabledCycles?.monthly !== false && <option value="monthly">Monthly</option>}
            {enabledCycles?.custom !== false && <option value="custom">Custom range</option>}
          </Select>
          {requestPeriod === "weekly" && (
            <Input
              label="Week containing (any date)"
              type="date"
              value={requestFrom}
              onChange={(e) => setRequestFrom(e.target.value)}
            />
          )}
          {requestPeriod === "monthly" && (
            <Input
              label="Month containing (any date)"
              type="date"
              value={requestFrom}
              onChange={(e) => setRequestFrom(e.target.value)}
            />
          )}
          {requestPeriod === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="From"
                type="date"
                required
                value={requestFrom}
                onChange={(e) => setRequestFrom(e.target.value)}
              />
              <Input
                label="To"
                type="date"
                required
                value={requestTo}
                onChange={(e) => setRequestTo(e.target.value)}
              />
            </div>
          )}
          <p className="text-xs text-slate-500">
            All draft expenses in this period will be included. You cannot edit them after submission.
          </p>
        </div>
      </Modal>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export expense report"
        description="Download a PDF or Excel report for a selected period."
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button type="button" isLoading={exporting} onClick={() => void handleExport()}>
              Download
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-3">
          <Select
            label="Format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "pdf" | "excel")}
          >
            <option value="pdf">PDF</option>
            <option value="excel">Excel</option>
          </Select>
          <Select
            label="Period"
            value={exportPeriod}
            onChange={(e) => setExportPeriod(e.target.value as ReimbursementPeriodType)}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom range</option>
          </Select>
          {exportPeriod === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="From"
                type="date"
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
              />
              <Input
                label="To"
                type="date"
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
              />
            </div>
          ) : (
            <Input
              label={exportPeriod === "weekly" ? "Week containing" : "Month containing"}
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
            />
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete expense?"
        description="This cannot be undone."
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" isLoading={saving} onClick={() => void handleDelete()}>
              Delete
            </Button>
          </ModalFooterActions>
        }
      >
        <p className="text-sm text-slate-600">
          Delete {deleteTarget ? formatMoney(deleteTarget.amount) : ""} expense from{" "}
          {deleteTarget ? formatDate(deleteTarget.expense_date) : ""}?
        </p>
      </Modal>
    </div>
  );
}

function ExpenseRow({
  expense,
  categories,
  paymentMethods,
  editable,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  categories: { key: string; label: string }[];
  paymentMethods: { key: string; label: string }[];
  editable?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const categoryLabel = categories.find((item) => item.key === expense.category)?.label ?? expense.category;
  const paymentLabel =
    paymentMethods.find((item) => item.key === expense.payment_method)?.label ?? expense.payment_method;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{formatMoney(expense.amount)}</p>
          <Badge tone={statusTone(expense.status)}>{expense.status}</Badge>
          <span className="text-xs text-slate-500">{formatDate(expense.expense_date)}</span>
        </div>
        <p className="text-sm text-slate-600">
          {categoryLabel} · {paymentLabel}
        </p>
        {expense.description && <p className="text-sm text-slate-500">{expense.description}</p>}
        {expense.admin_remarks && (
          <p className="text-xs text-red-600">
            {expense.status === "rejected" ? "Rejection reason" : "Admin remark"}:{" "}
            {expense.admin_remarks}
          </p>
        )}
        {expense.receipt_path && (
          <div className="mt-2">
            <ReceiptThumbnail path={expense.receipt_path} />
          </div>
        )}
      </div>
      {editable && (
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function RequestCard({
  request,
  expenses = [],
  categories,
  paymentMethods,
  showPaymentInfo,
}: {
  request: ExpenseReimbursementRequest;
  expenses?: Expense[];
  categories: { key: string; label: string }[];
  paymentMethods: { key: string; label: string }[];
  showPaymentInfo?: boolean;
}) {
  const paidAmount =
    request.approved_amount != null ? Number(request.approved_amount) : Number(request.requested_amount);

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">{periodLabel(request)}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Submitted {formatDate(request.submitted_at)} · {request.expense_count ?? 0} expense
              {(request.expense_count ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900">
              {showPaymentInfo && request.status !== "rejected"
                ? formatMoney(paidAmount)
                : formatMoney(request.requested_amount)}
            </p>
            {showPaymentInfo &&
              request.status !== "rejected" &&
              request.approved_amount != null &&
              Number(request.approved_amount) !== Number(request.requested_amount) && (
                <p className="text-xs text-slate-500">
                  Submitted {formatMoney(request.requested_amount)}
                </p>
              )}
            <div className="mt-1">
              <Badge tone={statusTone(request.status)}>{requestStatusLabel(request.status)}</Badge>
            </div>
          </div>
        </div>
        {request.admin_remarks && (
          <p className="mt-2 text-sm text-slate-600">Remark: {request.admin_remarks}</p>
        )}
        {showPaymentInfo && request.paid_at && (
          <p className="mt-2 text-xs text-slate-500">
            Paid {formatDate(request.paid_at)}
            {request.paid_by_name ? ` by ${request.paid_by_name}` : ""}
            {request.payment_notes ? ` · ${request.payment_notes}` : ""}
          </p>
        )}
        {showPaymentInfo && request.archived_at && (
          <p className="mt-1 text-xs text-slate-500">Archived {formatDate(request.archived_at)}</p>
        )}
      </div>
      {expenses.length > 0 && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {expenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              categories={categories}
              paymentMethods={paymentMethods}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
