import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CalendarClock } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import * as tasksApi from "@/api/tasks";
import { extractErrorMessage } from "@/api/client";
import type { TaskExtensionRequest } from "@/types";
import { formatDate } from "@/utils/format";

const FORM_ID = "task-extension-request-form";

interface TaskExtensionRequestModalProps {
  open: boolean;
  taskId: string | null;
  currentDueDate: string;
  onClose: () => void;
  onSubmitted: (request: TaskExtensionRequest) => void;
}

export function TaskExtensionRequestModal({
  open,
  taskId,
  currentDueDate,
  onClose,
  onSubmitted,
}: TaskExtensionRequestModalProps) {
  const [extensionDate, setExtensionDate] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setExtensionDate("");
      setExtensionReason("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!taskId) return;
    if (!extensionDate) {
      setError("Please select a new due date.");
      return;
    }
    if (extensionReason.trim().length < 5) {
      setError("Please provide a reason (at least 5 characters).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const request = await tasksApi.requestExtension(taskId, {
        requestedDueDate: extensionDate,
        reason: extensionReason.trim(),
      });
      onSubmitted(request);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to submit extension request"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request Extension"
      widthClassName="max-w-md"
      layout="centered"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            icon={<CalendarClock className="h-4 w-4" />}
            isLoading={submitting}
          >
            Submit Request
          </Button>
        </ModalFooterActions>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Current Due Date</p>
          <p className="mt-1 font-medium text-slate-900">{formatDate(currentDueDate)}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Your due date will remain unchanged until an admin approves this request.
          </p>
        </div>

        <Input
          label="Requested New Due Date"
          type="date"
          required
          min={currentDueDate || undefined}
          value={extensionDate}
          onChange={(e) => setExtensionDate(e.target.value)}
        />

        <Textarea
          label="Reason for Extension"
          required
          rows={4}
          placeholder="Explain why you need more time..."
          value={extensionReason}
          onChange={(e) => setExtensionReason(e.target.value)}
        />
      </form>
    </Modal>
  );
}
