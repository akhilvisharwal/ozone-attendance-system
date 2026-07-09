import { useCallback } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { CheckInContext } from "@/api/attendance";

export function CheckInConfirmModal({
  open,
  context,
  isLoading = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  context: CheckInContext | null;
  /** Driven by the parent check-in submission — single source of truth for loading. */
  isLoading?: boolean;
  onCancel: () => void;
  /** Must resolve when check-in finishes (success or failure). */
  onConfirm: () => void | Promise<void>;
}) {
  const isHoliday = context?.confirmationType === "holiday";
  const message = isHoliday
    ? context?.holidayName
      ? `Today is marked as a Holiday (${context.holidayName}). Are you sure you want to work today?`
      : "Today is marked as a Holiday. Are you sure you want to work today?"
    : "Today is marked as a Weekly Off. Are you sure you want to work today?";

  const handleCancel = useCallback(() => {
    if (isLoading) return;
    onCancel();
  }, [isLoading, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (isLoading) return;
    try {
      await onConfirm();
    } catch (err) {
      console.error("[CheckInConfirmModal] check-in confirmation failed:", err);
    }
  }, [isLoading, onConfirm]);

  return (
    <Modal
      open={open && !!context}
      onClose={handleCancel}
      title={isHoliday ? "Working on a Holiday?" : "Working on a Weekly Off?"}
      widthClassName="max-w-[22rem] sm:max-w-sm"
      layout="centered"
      compact
      initialFocus="first"
      footer={
        <ModalFooterActions>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={handleCancel}
            disabled={isLoading}
            className="h-10 w-full min-h-0 px-4 py-2 sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => void handleConfirm()}
            disabled={isLoading}
            isLoading={isLoading}
            icon={<CheckCircle2 className="h-4 w-4" />}
            className="h-11 w-full min-h-0 px-5 py-2.5 text-sm sm:w-auto"
          >
            Yes, Check In
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="flex items-center gap-3 rounded-lg border border-amber-200/80 bg-amber-50 p-4">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm ring-1 ring-amber-200/80">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-sm leading-snug text-slate-700">{message}</p>
      </div>
    </Modal>
  );
}
