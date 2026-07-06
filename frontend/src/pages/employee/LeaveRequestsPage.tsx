import { useState, useEffect, useCallback } from "react";
import { CalendarDays, PlusCircle, Trash2, Clock } from "lucide-react";
import type { LeaveRequest } from "../../types";
import * as leavesApi from "../../api/leaves";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Spinner } from "../../components/ui/Spinner";
import { Input, FieldWrapper, Textarea, Select } from "../../components/ui/Input";
import { ResponsiveTable, type Column } from "../../components/ui/ResponsiveTable";

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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function LeaveRequestsPage() {
  const { publicSettings } = usePublicSettings();
  const leaveConfig = publicSettings?.leave;
  const [items, setItems]       = useState<LeaveRequest[]>([]);
  const [limits, setLimits]     = useState<leavesApi.LeaveLimits | null>(null);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    leaveDate: "",
    leaveType: "full" as "full" | "half",
    leaveCategory: "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const limit = 10;

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await leavesApi.myLeaves({ page, limit });
      setItems(res.items);
      setTotal(res.total);
      if (res.limits) setLimits(res.limits);
    } catch {
      setError("Failed to load leave requests.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.leaveDate) { setFormError("Please select a date."); return; }
    if (!form.leaveCategory) { setFormError("Please select a leave category."); return; }
    if (form.leaveType === "half" && leaveConfig && !leaveConfig.halfDayAllowed) {
      setFormError("Half-day leave is not enabled.");
      return;
    }
    if (form.reason.trim().length < 10) { setFormError("Reason must be at least 10 characters."); return; }
    setSubmitting(true);
    try {
      await leavesApi.submitLeave(form);
      setSuccess(
        leaveConfig?.approvalRequired
          ? "Leave request submitted successfully. Awaiting admin approval."
          : "Leave request submitted and auto-approved."
      );
      setShowModal(false);
      setForm({ leaveDate: "", leaveType: "full", leaveCategory: leaveConfig?.leaveTypes[0] ?? "Annual", reason: "" });
      fetchLeaves();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setFormError(msg ?? "Failed to submit leave request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this pending leave request?")) return;
    try {
      await leavesApi.cancelLeave(id);
      setSuccess("Leave request cancelled.");
      fetchLeaves();
    } catch {
      setError("Failed to cancel leave request.");
    }
  }

  const totalPages = Math.ceil(total / limit);

  const columns: Column<LeaveRequest>[] = [
    { header: "Date", primary: true, cell: (lr) => <span className="font-medium">{lr.leave_date}</span> },
    { header: "Category", cell: (lr) => lr.leave_category ?? "—" },
    { header: "Duration", cell: (lr) => TYPE_LABELS[lr.leave_type] },
    {
      header: "Reason",
      cell: (lr) => (
        <span className="block truncate" title={lr.reason}>
          {lr.reason}
        </span>
      ),
    },
    { header: "Status", cell: (lr) => <Badge tone={STATUS_COLORS[lr.status]}>{STATUS_LABELS[lr.status]}</Badge> },
    {
      header: "Admin Note",
      cell: (lr) => <span className="text-xs text-gray-500">{lr.review_note ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Requests"
        description="Submit and track your leave requests"
        icon={<CalendarDays className="w-6 h-6" />}
        action={
          <Button onClick={() => { setSuccess(null); setFormError(null); setShowModal(true); }}>
            <PlusCircle className="w-4 h-4 mr-2" />
            New Request
          </Button>
        }
      />

      {success && <Alert variant="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {error   && <Alert variant="error"   onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardBody>
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-gray-500 py-10">No leave requests yet.</p>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={items}
              rowKey={(lr) => lr.id}
              actions={(lr) =>
                lr.status === "pending" ? (
                  <button
                    onClick={() => handleCancel(lr.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700"
                    title="Cancel request"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null
              }
            />
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-gray-100 pt-4 sm:flex-row">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Submit leave modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Submit Leave Request">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldWrapper label="Leave Date" required>
              <Input
                type="date"
                min={todayStr()}
                value={form.leaveDate}
                onChange={e => setForm(f => ({ ...f, leaveDate: e.target.value }))}
                required
              />
            </FieldWrapper>
            <FieldWrapper label="Leave Category" required>
              <Select
                value={form.leaveCategory || leaveConfig?.leaveTypes[0] || "Annual"}
                onChange={e => setForm(f => ({ ...f, leaveCategory: e.target.value }))}
              >
                {(leaveConfig?.leaveTypes ?? ["Annual", "Sick", "Casual"]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Duration" required>
              <Select
                value={form.leaveType}
                onChange={e => setForm(f => ({ ...f, leaveType: e.target.value as "full" | "half" }))}
              >
                <option value="full">Full Day</option>
                {(leaveConfig?.halfDayAllowed ?? true) && <option value="half">Half Day</option>}
              </Select>
            </FieldWrapper>
          </div>

          {limits && (
            <p className="text-xs text-slate-500">
              Annual limit: {limits.annual} · Sick: {limits.sick} · Casual: {limits.casual}
            </p>
          )}

          <FieldWrapper label="Reason" required>
            <Textarea
              rows={4}
              placeholder="Please describe the reason for your leave (min 10 characters)"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              required
            />
          </FieldWrapper>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-800">
            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              {leaveConfig?.approvalRequired
                ? "Your request will be visible to the admin and applied only after approval."
                : "Your request will be auto-approved based on system settings."}
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" isLoading={submitting}>Submit Request</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
