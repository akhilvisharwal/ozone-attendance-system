import { useEffect, useState } from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function CheckOutConfirmModal({
  open,
  onCancel,
  onContinue,
}: {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    if (!open) setContinuing(false);
  }, [open]);

  function handleCancel() {
    if (continuing) return;
    onCancel();
  }

  function handleContinue() {
    if (continuing) return;
    setContinuing(true);
    onContinue();
  }

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title="Check Out for Today?"
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
            disabled={continuing}
            className="h-10 w-full min-h-0 px-4 py-2 sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handleContinue}
            disabled={continuing}
            isLoading={continuing}
            icon={<LogOut className="h-4 w-4" />}
            className="h-11 w-full min-h-0 px-5 py-2.5 text-sm sm:w-auto"
          >
            Continue to Check Out
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="flex items-center gap-3 rounded-lg border border-amber-200/80 bg-amber-50 p-4">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm ring-1 ring-amber-200/80">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-sm leading-snug text-slate-700">
          Are you sure you want to check out? You won&apos;t be able to check in again today.
        </p>
      </div>
    </Modal>
  );
}
