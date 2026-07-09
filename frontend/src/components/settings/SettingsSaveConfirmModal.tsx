import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const DEFAULT_MESSAGE =
  "Are you sure you want to save these changes? They will take effect immediately.";

export function SettingsSaveConfirmModal({
  open,
  onCancel,
  onConfirm,
  title = "Save changes?",
  message = DEFAULT_MESSAGE,
  confirmLabel = "Save",
  confirmVariant = "primary",
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message?: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
}) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setSaving(false);
  }, [open]);

  function handleCancel() {
    if (saving) return;
    onCancel();
  }

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title={title}
      widthClassName="max-w-[22rem] sm:max-w-md"
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
            disabled={saving}
            className="h-10 w-full min-h-0 px-4 py-2 sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant === "danger" ? "danger" : "primary"}
            size="lg"
            onClick={() => void handleConfirm()}
            disabled={saving}
            isLoading={saving}
            className="h-11 w-full min-h-0 px-5 py-2.5 text-sm sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="flex items-start gap-3 rounded-lg border border-amber-200/80 bg-amber-50 p-4">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm ring-1 ring-amber-200/80">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-sm leading-snug text-slate-700">{message}</p>
      </div>
    </Modal>
  );
}
