import { useState, useEffect, useCallback } from "react";
import { CalendarCheck, Check, X, Filter, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { LeaveRequest, LeaveStatus } from "../../types";
import * as leavesApi from "../../api/leaves";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal, ModalFooterActions } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea, FieldWrapper, Select } from "../../components/ui/Input";
import { TaskDeleteConfirmModal } from "@/components/tasks/TaskDeleteConfirmModal";
import { CrossfadeSwitch } from "@/components/ui/CrossfadeSwitch";

const STATUS_COLORS: Record<string, "amber" | "green" | "red"> = {
  pending:  "amber",
  approved: "green",
  rejected: "red",
};

const STATUS_LABELS: Record<string, string> = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const TYPE_LABELS: Record<string, string> = { full: "Full Day", half: "Half Day" };

export default function LeaveManagementPage() {
  const [items, setItems]     = useState<LeaveRequest[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<LeaveStatus | "">("");
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const [reviewModal, setReviewModal] = useState<LeaveRequest | null>(null);
  const [reviewNote, setReviewNote]   = useState("");
  const [reviewing, setReviewing]     = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveRequest | null>(null);

  const limit = 15;

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: leavesApi.AdminListLeavesParams = { page, limit };
      if (filterStatus) params.status = filterStatus;
      const res = await leavesApi.adminListLeaves(params);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setError("Failed to load leave requests.");
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  function openReview(item: LeaveRequest) {
    setReviewModal(item);
    setReviewNote("");
    setReviewError(null);
  }

  async function handleReview(decision: "approved" | "rejected") {
    if (!reviewModal) return;
    setReviewing(true);
    setReviewError(null);
    try {
      await leavesApi.adminReviewLeave(reviewModal.id, {
        status: decision,
        reviewNote: reviewNote.trim() || undefined,
      });
      setSuccess(`Leave request ${decision} successfully.`);
      setReviewModal(null);
      fetchLeaves();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setReviewError(msg ?? "Failed to review leave request.");
    } finally {
      setReviewing(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await leavesApi.adminDeleteLeave(id);
      setSuccess("Leave request deleted.");
      setDeleteTarget(null);
      if (reviewModal?.id === id) setReviewModal(null);
      fetchLeaves();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? "Failed to delete leave request.");
    }
  }

  function deleteMessage(leave: LeaveRequest): string {
    const base = `Delete the ${leave.status} leave request for ${leave.employee_name ?? "this employee"} on ${leave.leave_date}?`;
    if (leave.status === "approved") {
      return `${base} This will restore their leave balance and remove the leave from attendance records. This cannot be undone.`;
    }
    return `${base} This cannot be undone.`;
  }

  const totalPages = Math.ceil(total / limit);
  const pending = items.filter(i => i.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        description={`Manage employee leave requests${pending > 0 ? ` — ${pending} pending` : ""}`}
        icon={<CalendarCheck className="w-6 h-6" />}
      />

      {success && <Alert variant="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {error   && <Alert variant="error"   onClose={() => setError(null)}>{error}</Alert>}

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2 text-gray-500">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">Filter by status:</span>
            </div>
            <Select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value as LeaveStatus | ""); setPage(1); }}
              className="sm:w-44"
            >
              <option value="">All Requests</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
            <p className="text-sm text-gray-500 sm:ml-auto">{total} request{total !== 1 ? "s" : ""}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <CrossfadeSwitch state={loading ? "loading" : "content"}>
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-gray-500 py-10">No leave requests found.</p>
          ) : (
            <>
            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {items.map(lr => (
                <div key={lr.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{lr.employee_name ?? "—"}</p>
                      <p className="text-xs text-slate-400">{lr.employee_code ?? ""}</p>
                    </div>
                    <Badge tone={STATUS_COLORS[lr.status]}>{STATUS_LABELS[lr.status]}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Date</dt>
                      <dd className="text-slate-700">{lr.leave_date}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Type</dt>
                      <dd className="text-slate-700">{TYPE_LABELS[lr.leave_type]}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Submitted</dt>
                      <dd className="text-slate-700">{new Date(lr.created_at).toLocaleDateString()}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 text-sm text-slate-600">
                    <span className="font-semibold">Reason: </span>{lr.reason}
                  </div>
                  {lr.review_note && (
                    <div className="mt-1 text-sm text-slate-600">
                      <span className="font-semibold">Admin note: </span>{lr.review_note}
                    </div>
                  )}
                  {lr.status === "pending" && (
                    <Button size="sm" className="mt-3 w-full" onClick={() => openReview(lr)}>
                      Review Request
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteTarget(lr)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    {["Employee", "Date", "Type", "Status", "Submitted", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(lr => (
                    <>
                      <tr key={lr.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{lr.employee_name ?? "—"}</div>
                          <div className="text-xs text-gray-400">{lr.employee_code ?? ""}</div>
                        </td>
                        <td className="px-4 py-3 font-medium">{lr.leave_date}</td>
                        <td className="px-4 py-3">{TYPE_LABELS[lr.leave_type]}</td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_COLORS[lr.status]}>{STATUS_LABELS[lr.status]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(lr.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => setExpandedId(expandedId === lr.id ? null : lr.id)}
                              className="text-gray-400 hover:text-gray-600 p-1 rounded"
                              title="View reason"
                            >
                              {expandedId === lr.id
                                ? <ChevronUp className="w-4 h-4" />
                                : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {lr.status === "pending" && (
                              <button
                                onClick={() => openReview(lr)}
                                className="flex items-center gap-1 text-xs bg-brand-500 hover:bg-brand-600 text-white px-2 py-1 rounded font-medium"
                              >
                                Review
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteTarget(lr)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700"
                              title="Delete leave request"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === lr.id && (
                        <tr key={`${lr.id}-expand`} className="bg-gray-50">
                          <td colSpan={6} className="px-8 py-3 text-sm text-gray-600">
                            <div><span className="font-semibold">Reason: </span>{lr.reason}</div>
                            {lr.review_note && (
                              <div className="mt-1"><span className="font-semibold">Admin note: </span>{lr.review_note}</div>
                            )}
                            {lr.reviewed_by_name && (
                              <div className="mt-1 text-xs text-gray-400">
                                Reviewed by {lr.reviewed_by_name}
                                {lr.reviewed_at ? ` on ${new Date(lr.reviewed_at).toLocaleDateString()}` : ""}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          </CrossfadeSwitch>

          {totalPages > 1 && (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-gray-100 pt-4 sm:flex-row">
              <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total} total)</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Review modal */}
      {reviewModal && (
        <Modal
          open={true}
          onClose={() => setReviewModal(null)}
          title="Review Leave Request"
          widthClassName="max-w-lg"
          footer={
            <ModalFooterActions>
              <Button type="button" variant="secondary" onClick={() => setReviewModal(null)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                isLoading={reviewing}
                onClick={() => handleReview("rejected")}
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-1" />
                Reject
              </Button>
              <Button
                isLoading={reviewing}
                onClick={() => handleReview("approved")}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="w-4 h-4 mr-1" />
                Approve
              </Button>
            </ModalFooterActions>
          }
        >
          <div className="space-y-4">
            {reviewError && <Alert variant="error">{reviewError}</Alert>}

            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Employee</span>
                <span className="font-medium">{reviewModal.employee_name} ({reviewModal.employee_code})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Leave Date</span>
                <span className="font-medium">{reviewModal.leave_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-medium">{TYPE_LABELS[reviewModal.leave_type]}</span>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Reason</span>
                <p className="text-gray-800">{reviewModal.reason}</p>
              </div>
            </div>

            <FieldWrapper label="Admin Note (optional)">
              <Textarea
                rows={3}
                placeholder="Add a note to the employee about your decision..."
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
              />
            </FieldWrapper>
          </div>
        </Modal>
      )}

      <TaskDeleteConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Leave Request?"
        message={deleteTarget ? deleteMessage(deleteTarget) : ""}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
