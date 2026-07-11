import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { Archive, Check, Download, Eye, IndianRupee, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { ReceiptThumbnail } from "@/components/ReceiptThumbnail";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";
import { staggerContainer, staggerItem } from "@/lib/motion";
import * as expensesApi from "@/api/expenses";
import * as juniorAdminsApi from "@/api/juniorAdmins";
import { extractErrorMessage } from "@/api/client";
import type { Employee, Expense, ExpenseReimbursementRequest, ReimbursementPeriodType, RequestExpenseSummary } from "@/types";
import { formatDate } from "@/utils/format";

type StatusFilter = "" | "pending_approval" | "approved" | "paid" | "archived" | "rejected";

const CATEGORY_LABELS: Record<string, string> = {
  travel: "Travel",
  food: "Food",
  material: "Material",
  fuel: "Fuel",
  miscellaneous: "Miscellaneous",
  other: "Other",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  card: "Card",
  other: "Other",
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
  if (status === "pending_approval") return "amber";
  if (status === "archived") return "slate";
  return "blue";
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

function computeSummary(expenses: Expense[]): RequestExpenseSummary {
  let approvedAmount = 0;
  let rejectedAmount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;

  for (const expense of expenses) {
    const amount = Number(expense.amount);
    if (expense.status === "pending") {
      pendingAmount += amount;
      pendingCount += 1;
    } else if (expense.status === "approved") {
      approvedAmount += amount;
      approvedCount += 1;
    } else if (expense.status === "rejected") {
      rejectedAmount += amount;
      rejectedCount += 1;
    }
  }

  return {
    totalSubmitted: approvedAmount + rejectedAmount + pendingAmount,
    approvedAmount,
    rejectedAmount,
    pendingAmount,
    payableAmount: approvedAmount,
    pendingCount,
    approvedCount,
    rejectedCount,
    reviewedCount: approvedCount + rejectedCount,
  };
}

function payableAmount(request: ExpenseReimbursementRequest, summary?: RequestExpenseSummary | null) {
  if (summary) return summary.payableAmount;
  if (request.approved_amount != null) return Number(request.approved_amount);
  return Number(request.requested_amount);
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

export function ExpenseManagementPage() {
  const [requests, setRequests] = useState<ExpenseReimbursementRequest[]>([]);
  const [summary, setSummary] = useState<{ requestCount: number; totalAmount: number } | null>(null);
  const [juniorAdmins, setJuniorAdmins] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<StatusFilter>("pending_approval");
  const [detailRequest, setDetailRequest] = useState<ExpenseReimbursementRequest | null>(null);
  const [detailExpenses, setDetailExpenses] = useState<Expense[]>([]);
  const [detailSummary, setDetailSummary] = useState<RequestExpenseSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lineRejectTarget, setLineRejectTarget] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lineActionId, setLineActionId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<ExpenseReimbursementRequest | null>(null);
  const [payNotes, setPayNotes] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<ExpenseReimbursementRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "excel">("pdf");
  const [exportPeriod, setExportPeriod] = useState<ReimbursementPeriodType>("monthly");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportEmployeeId, setExportEmployeeId] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [requestData, summaryData, admins] = await Promise.all([
        expensesApi.adminListRequests({
          employeeId: employeeId || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
        }),
        expensesApi.getReimbursementSummary(),
        juniorAdminsApi.listJuniorAdmins(),
      ]);
      setRequests(requestData.requests);
      setSummary(summaryData);
      setJuniorAdmins(admins);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load reimbursement requests."));
    } finally {
      setLoading(false);
    }
  }, [employeeId, from, to, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(request: ExpenseReimbursementRequest) {
    setDetailRequest(request);
    setDetailExpenses([]);
    setDetailSummary(null);
    setDetailLoading(true);
    try {
      const data = await expensesApi.adminGetRequest(request.id);
      setDetailRequest(data.request);
      setDetailExpenses(data.expenses);
      setDetailSummary(data.summary);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load request details."));
      setDetailRequest(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail(requestId: string) {
    const data = await expensesApi.adminGetRequest(requestId);
    setDetailRequest(data.request);
    setDetailExpenses(data.expenses);
    setDetailSummary(data.summary);
    return data;
  }

  async function handleLineApprove(expense: Expense) {
    if (!detailRequest) return;
    setLineActionId(expense.id);
    setError(null);
    try {
      const data = await expensesApi.adminReviewRequestExpense(detailRequest.id, expense.id, {
        status: "approved",
      });
      setDetailRequest(data.request);
      setDetailExpenses((prev) =>
        prev.map((row) => (row.id === expense.id ? data.expense : row))
      );
      setDetailSummary(data.summary);
      setMessage("Expense approved.");
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not approve expense."));
    } finally {
      setLineActionId(null);
    }
  }

  async function handleLineReject() {
    if (!detailRequest || !lineRejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setError("Rejection reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await expensesApi.adminReviewRequestExpense(
        detailRequest.id,
        lineRejectTarget.id,
        { status: "rejected", remarks: reason }
      );
      setDetailRequest(data.request);
      setDetailExpenses((prev) =>
        prev.map((row) => (row.id === lineRejectTarget.id ? data.expense : row))
      );
      setDetailSummary(data.summary);
      setMessage("Expense rejected.");
      setLineRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not reject expense."));
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveAllRemaining() {
    if (!detailRequest) return;
    setSaving(true);
    setError(null);
    try {
      const data = await expensesApi.adminApproveAllRemaining(detailRequest.id);
      const refreshed = await refreshDetail(detailRequest.id);
      setDetailRequest(refreshed.request);
      setDetailExpenses(refreshed.expenses);
      setDetailSummary(data.summary);
      setMessage("All remaining expenses approved.");
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not approve remaining expenses."));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid() {
    if (!payTarget) return;
    setSaving(true);
    setError(null);
    try {
      await expensesApi.adminMarkRequestPaid(payTarget.id, {
        notes: payNotes.trim() || null,
      });
      setMessage(`Payment recorded for ${payTarget.employee_name ?? "Junior Admin"}.`);
      setPayTarget(null);
      setPayNotes("");
      if (detailRequest?.id === payTarget.id) setDetailRequest(null);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not mark request as paid."));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setSaving(true);
    setError(null);
    try {
      await expensesApi.adminArchiveRequest(archiveTarget.id);
      setMessage("Request archived for audit retention.");
      setArchiveTarget(null);
      if (detailRequest?.id === archiveTarget.id) setDetailRequest(null);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not archive request."));
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
        employeeId?: string;
      } = {
        format: exportFormat,
        period: exportPeriod,
        employeeId: exportEmployeeId || undefined,
      };

      if (exportPeriod === "weekly") {
        params.from = exportFrom || currentWeekRange().from;
      } else if (exportPeriod === "monthly") {
        params.from = exportFrom || currentMonthRange().from;
      } else {
        if (!exportFrom || !exportTo) {
          setError("Custom period requires both from and to dates.");
          return;
        }
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

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Expense Approval"
        subtitle="Review reimbursement requests, approve or reject them, and record payments."
        action={
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            onClick={() => setExportOpen(true)}
          >
            Export report
          </Button>
        }
      />

      {summary && summary.requestCount > 0 && (
        <Card className="mb-4 border-amber-100 bg-amber-50/50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {summary.requestCount} request{summary.requestCount === 1 ? "" : "s"} pending approval ·{" "}
            {formatMoney(summary.totalAmount)} total requested
          </p>
        </Card>
      )}

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

      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              { id: "pending_approval" as const, label: "Pending approval" },
              { id: "approved" as const, label: "Approved" },
              { id: "paid" as const, label: "Paid" },
              { id: "archived" as const, label: "Archived" },
              { id: "rejected" as const, label: "Rejected" },
              { id: "" as const, label: "All" },
            ] as const
          ).map((item) => (
            <button
              key={item.id || "all"}
              type="button"
              onClick={() => setStatus(item.id)}
              className={clsx(
                "min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0",
                status === item.id
                  ? "bg-brand-50 text-brand-700"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Junior Admin"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">All Junior Admins</option>
            {juniorAdmins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.name} ({admin.employee_code})
              </option>
            ))}
          </Select>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <CrossfadeSwitch state={loading ? "loading" : status}>
      {loading ? (
        <ContentSkeleton />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No reimbursement requests"
          description="Junior Admin reimbursement requests will appear here for review."
        />
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
          {requests.map((request) => (
            <motion.div key={request.id} variants={staggerItem}>
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => void openDetail(request)}
                >
                  <EmployeeAvatar
                    name={request.employee_name ?? "User"}
                    photoPath={request.employee_profile_photo_path}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {request.employee_name}{" "}
                      <span className="font-normal text-slate-500">({request.employee_code})</span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">{periodLabel(request)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Submitted {formatDate(request.submitted_at)} · {request.expense_count ?? 0} expenses
                    </p>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      {request.status === "approved" && request.approved_amount != null
                        ? formatMoney(request.approved_amount)
                        : formatMoney(request.requested_amount)}
                    </p>
                    <Badge tone={statusTone(request.status)}>{requestStatusLabel(request.status)}</Badge>
                  </div>
                  {request.status === "pending_approval" && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Eye className="h-3.5 w-3.5" />}
                      onClick={() => void openDetail(request)}
                    >
                      Review
                    </Button>
                  )}
                  {request.status === "approved" && (
                    <Button
                      size="sm"
                      icon={<IndianRupee className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setPayTarget(request);
                        setPayNotes("");
                      }}
                    >
                      Mark paid
                    </Button>
                  )}
                  {request.status === "paid" && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Archive className="h-3.5 w-3.5" />}
                      onClick={() => setArchiveTarget(request)}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
      </CrossfadeSwitch>

      <Modal
        open={Boolean(detailRequest)}
        onClose={() => setDetailRequest(null)}
        title="Reimbursement request"
        description={detailRequest ? periodLabel(detailRequest) : undefined}
        widthClassName="max-w-3xl"
        footer={
          <ModalFooterActions>
            {detailRequest?.status === "pending_approval" && detailSummary && (
              <Button
                type="button"
                variant="outline"
                icon={<Check className="h-4 w-4" />}
                isLoading={saving}
                disabled={
                  detailSummary.pendingCount === 0 || detailSummary.reviewedCount === 0
                }
                onClick={() => void handleApproveAllRemaining()}
              >
                Approve all remaining
              </Button>
            )}
            {detailRequest?.status === "approved" && (
              <Button
                type="button"
                icon={<IndianRupee className="h-4 w-4" />}
                onClick={() => {
                  setPayTarget(detailRequest);
                  setPayNotes("");
                }}
              >
                Mark paid
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setDetailRequest(null)}>
              Close
            </Button>
          </ModalFooterActions>
        }
      >
        {detailRequest && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-600">
                <EmployeeAvatar
                  name={detailRequest.employee_name ?? "User"}
                  photoPath={detailRequest.employee_profile_photo_path}
                  size="sm"
                />
                {detailRequest.employee_name} ({detailRequest.employee_code})
              </span>
              <Badge tone={statusTone(detailRequest.status)}>
                {requestStatusLabel(detailRequest.status)}
              </Badge>
            </div>

            {detailLoading ? (
              <ContentSkeleton rows={4} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(
                    [
                      {
                        label: "Total submitted",
                        value: formatMoney(
                          detailSummary?.totalSubmitted ??
                            computeSummary(detailExpenses).totalSubmitted
                        ),
                      },
                      {
                        label: "Approved",
                        value: formatMoney(
                          detailSummary?.approvedAmount ??
                            computeSummary(detailExpenses).approvedAmount
                        ),
                        tone: "text-green-700",
                      },
                      {
                        label: "Rejected",
                        value: formatMoney(
                          detailSummary?.rejectedAmount ??
                            computeSummary(detailExpenses).rejectedAmount
                        ),
                        tone: "text-red-700",
                      },
                      {
                        label: "Pending",
                        value: formatMoney(
                          detailSummary?.pendingAmount ??
                            computeSummary(detailExpenses).pendingAmount
                        ),
                        tone: "text-amber-700",
                      },
                      {
                        label: "Payable",
                        value: formatMoney(
                          detailSummary?.payableAmount ??
                            computeSummary(detailExpenses).payableAmount
                        ),
                        tone: "text-brand-700",
                      },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        {item.label}
                      </p>
                      <p
                        className={clsx(
                          "mt-0.5 text-sm font-semibold text-slate-900",
                          "tone" in item ? item.tone : undefined
                        )}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {detailExpenses.length === 0 ? (
                  <p className="text-sm text-slate-500">No line items found.</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {detailExpenses.map((expense) => (
                      <div key={expense.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{formatMoney(expense.amount)}</p>
                            <Badge tone={statusTone(expense.status)}>{expense.status}</Badge>
                            <span className="text-xs text-slate-500">
                              {formatDate(expense.expense_date)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">
                            {CATEGORY_LABELS[expense.category] ?? expense.category} ·{" "}
                            {PAYMENT_LABELS[expense.payment_method] ?? expense.payment_method}
                          </p>
                          {expense.description && (
                            <p className="text-sm text-slate-500">{expense.description}</p>
                          )}
                          {expense.admin_remarks && (
                            <p className="mt-1 text-xs text-red-600">
                              Rejection reason: {expense.admin_remarks}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          {expense.receipt_path && (
                            <ReceiptThumbnail path={expense.receipt_path} sizeClassName="h-16 w-16" />
                          )}
                          {detailRequest.status === "pending_approval" &&
                            expense.status === "pending" && (
                              <div className="flex flex-col gap-1 sm:flex-row">
                                <Button
                                  size="sm"
                                  icon={<Check className="h-3.5 w-3.5" />}
                                  isLoading={lineActionId === expense.id}
                                  onClick={() => void handleLineApprove(expense)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<X className="h-3.5 w-3.5" />}
                                  onClick={() => {
                                    setLineRejectTarget(expense);
                                    setRejectReason("");
                                  }}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(lineRejectTarget)}
        onClose={() => setLineRejectTarget(null)}
        title="Reject expense"
        description="A rejection reason is required. The Junior Admin will see this on the expense."
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setLineRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={saving}
              disabled={!rejectReason.trim()}
              onClick={() => void handleLineReject()}
            >
              Reject expense
            </Button>
          </ModalFooterActions>
        }
      >
        {lineRejectTarget && (
          <p className="mb-3 text-sm text-slate-600">
            {formatMoney(lineRejectTarget.amount)} · {formatDate(lineRejectTarget.expense_date)}
          </p>
        )}
        <Textarea
          label="Rejection reason"
          rows={3}
          required
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Explain why this expense was rejected"
        />
      </Modal>

      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="Mark as paid"
        description="Record that reimbursement has been completed."
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button type="button" isLoading={saving} onClick={() => void handleMarkPaid()}>
              Mark paid
            </Button>
          </ModalFooterActions>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          {payTarget?.employee_name} · {payTarget ? periodLabel(payTarget) : ""} · Payable{" "}
          {payTarget ? formatMoney(payableAmount(payTarget)) : ""}
        </p>
        <Textarea
          label="Payment notes"
          rows={3}
          value={payNotes}
          onChange={(e) => setPayNotes(e.target.value)}
          placeholder="Optional payment reference"
        />
      </Modal>

      <Modal
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title="Archive request?"
        description="Archived records are kept for audit. They can be permanently removed later from Database cleanup."
        footer={
          <ModalFooterActions>
            <Button type="button" variant="secondary" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button type="button" isLoading={saving} onClick={() => void handleArchive()}>
              Archive
            </Button>
          </ModalFooterActions>
        }
      >
        <p className="text-sm text-slate-600">
          Archive paid request for {archiveTarget?.employee_name} (
          {archiveTarget ? formatMoney(payableAmount(archiveTarget)) : ""})?
        </p>
      </Modal>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export expense report"
        description="Download a PDF or Excel report for all or one Junior Admin."
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
            label="Junior Admin"
            value={exportEmployeeId}
            onChange={(e) => setExportEmployeeId(e.target.value)}
          >
            <option value="">All Junior Admins</option>
            {juniorAdmins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.name} ({admin.employee_code})
              </option>
            ))}
          </Select>
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
    </div>
  );
}
