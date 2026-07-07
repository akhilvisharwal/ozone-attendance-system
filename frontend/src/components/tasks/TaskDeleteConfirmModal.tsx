import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function TaskDeleteConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  async function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!confirming) onCancel();
      }}
      title={title}
      widthClassName="max-w-[22rem] sm:max-w-sm"
      layout="centered"
      compact
      initialFocus="first"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="outline" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={handleConfirm}
            isLoading={confirming}
          >
            {confirmLabel}
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="flex items-center gap-3 rounded-lg border border-red-200/80 bg-red-50 p-4">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-red-600 shadow-sm ring-1 ring-red-200/80">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-sm leading-snug text-slate-700">{message}</p>
      </div>
    </Modal>
  );
}
