import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { AttendanceOverrideListItem } from "@/api/attendanceOverrides";
import { formatDate, formatDateTime } from "@/utils/format";
import { summarizeOverrideRules } from "@/utils/attendanceOverrideDisplay";

export function AttendanceOverrideViewModal({
  override,
  onClose,
  onEdit,
}: {
  override: AttendanceOverrideListItem | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!override) return null;

  const dateLabel =
    override.startDate === override.endDate
      ? formatDate(override.startDate)
      : `${formatDate(override.startDate)} – ${formatDate(override.endDate)}`;

  const assignmentLabel = override.applyToAll
    ? "All Employees"
    : override.employees.length > 0
      ? override.employees.map((e) => e.name).join(", ")
      : "No employees assigned";

  return (
    <Modal open={Boolean(override)} onClose={onClose} title="Override details" widthClassName="max-w-xl">
      <dl className="space-y-4 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Reason</dt>
          <dd className="mt-1 font-medium text-slate-900">{override.reason}</dd>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Date range</dt>
            <dd className="mt-1 text-slate-900">{dateLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</dt>
            <dd className="mt-1 capitalize text-slate-900">
              {override.status}
              {!override.isEnabled ? " · Disabled" : ""}
            </dd>
          </div>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Assigned employees</dt>
          <dd className="mt-1 text-slate-900">{assignmentLabel}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Affected rules</dt>
          <dd className="mt-1 text-slate-700">{summarizeOverrideRules(override)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Created</dt>
          <dd className="mt-1 text-slate-700">{formatDateTime(override.createdAt)}</dd>
        </div>
      </dl>
      <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onEdit}>Edit</Button>
      </div>
    </Modal>
  );
}
