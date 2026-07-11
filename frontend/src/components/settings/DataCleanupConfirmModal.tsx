import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CleanupCategorySummary } from "@/types/settings";

type LegacyProps = {
  open: boolean;
  title: string;
  description: string;
  details: string[];
  affectedRecords: number;
  category?: never;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

type CategoryProps = {
  open: boolean;
  category: CleanupCategorySummary | null;
  title?: never;
  description?: never;
  details?: never;
  affectedRecords?: never;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DataCleanupConfirmModal(props: LegacyProps | CategoryProps) {
  const { open, onCancel, onConfirm } = props;
  const category = "category" in props ? props.category : null;
  const title =
    "title" in props && props.title
      ? props.title
      : category
        ? `Delete ${category.label}`
        : "Confirm cleanup";
  const description =
    "description" in props && props.description
      ? props.description
      : category?.description ?? "";
  const details =
    "details" in props && props.details
      ? props.details
      : category
        ? [
            `${category.recordCount.toLocaleString()} record${category.recordCount === 1 ? "" : "s"}`,
            ...(category.fileCount > 0
              ? [
                  `${category.fileCount.toLocaleString()} file${category.fileCount === 1 ? "" : "s"}`,
                ]
              : []),
            `Storage to be permanently freed: ${category.totalLabel}`,
          ]
        : [];
  const affectedRecords =
    "affectedRecords" in props && props.affectedRecords != null
      ? props.affectedRecords
      : category?.recordCount ?? 0;
  const canExecute = category ? category.canDelete : affectedRecords > 0;

  const [saving, setSaving] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setTyped("");
    }
  }, [open]);

  function handleCancel() {
    if (saving) return;
    onCancel();
  }

  async function handleConfirm() {
    if (saving || typed !== "DELETE" || !canExecute) return;
    setSaving(true);
    try {
      await onConfirm();
    } finally {
      setSaving(false);
    }
  }

  const canConfirm = typed === "DELETE" && !saving && canExecute;

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title={title}
      widthClassName="max-w-[24rem] sm:max-w-md"
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
            variant="danger"
            size="lg"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            isLoading={saving}
            className="h-11 w-full min-h-0 px-5 py-2.5 text-sm sm:w-auto"
          >
            Delete permanently
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-red-200/80 bg-red-50 p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-red-600 shadow-sm ring-1 ring-red-200/80">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm leading-snug text-slate-700">{description}</p>
            <p className="text-sm font-semibold text-red-800">
              This action permanently deletes the selected data from the database and cannot be
              undone.
            </p>
            <p className="text-sm font-semibold text-red-700">
              {affectedRecords.toLocaleString()} record{affectedRecords === 1 ? "" : "s"}
              {category && category.fileCount > 0 &&
                ` and ${category.fileCount.toLocaleString()} file${category.fileCount === 1 ? "" : "s"}`}{" "}
              will be permanently removed.
            </p>
            {category && category.totalBytes > 0 && (
              <p className="text-sm font-medium text-slate-800">
                Storage to be permanently freed: {category.totalLabel}
                {(category.databaseBytes > 0 || category.fileBytes > 0) && (
                  <>
                    {" "}
                    ({category.databaseLabel} database
                    {category.fileBytes > 0 ? `, ${category.fileLabel} files` : ""})
                  </>
                )}
              </p>
            )}
            {details.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                {details.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {category && (
              <p className="text-xs text-slate-500">
                PostgreSQL rows and linked upload files are permanently deleted together. Live
                database and storage statistics refresh immediately after deletion.
              </p>
            )}
          </div>
        </div>

        <Input
          label="Type DELETE to confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </Modal>
  );
}
