import { useEffect, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function CompanySaveConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
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
      title="Save Company Information?"
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
            variant="primary"
            size="lg"
            onClick={() => void handleConfirm()}
            disabled={saving}
            isLoading={saving}
            icon={<Save className="h-4 w-4" />}
            className="h-11 w-full min-h-0 px-5 py-2.5 text-sm sm:w-auto"
          >
            Save Changes
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="flex items-start gap-3 rounded-lg border border-amber-200/80 bg-amber-50 p-4">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm ring-1 ring-amber-200/80">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-sm leading-snug text-slate-700">
          Are you sure you want to save these changes to the Company Information? These changes will be
          applied across the entire application.
        </p>
      </div>
    </Modal>
  );
}
