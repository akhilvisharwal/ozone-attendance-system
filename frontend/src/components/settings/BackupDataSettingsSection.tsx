import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  HardDriveDownload,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/utils/format";
import type { BackupSettings } from "@/types/settings";

type PendingAction =
  | { type: "backup" }
  | { type: "restore"; file: File }
  | { type: "exportJson"; exportType: "all" | "attendance" | "employees" }
  | { type: "exportReport"; format: "pdf" | "excel"; scope: "full" | "attendance" | "employees" }
  | { type: "toggleAutoBackup"; next: BackupSettings };

export function BackupDataSettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [backup, setBackup] = useState<BackupSettings | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await settingsApi.fetchBackupStatus();
      setBackup(data.backup);
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load backup settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  function openConfirm(action: PendingAction) {
    setPendingAction(action);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (busy) return;
    setConfirmOpen(false);
    setPendingAction(null);
  }

  async function handleConfirmAction() {
    if (!pendingAction) return;

    setBusy(true);
    setMessage(null);
    try {
      if (pendingAction.type === "backup") {
        await settingsApi.runBackupNow();
        await loadStatus();
        await refresh();
        setMessage({ type: "success", text: "Backup created successfully." });
      } else if (pendingAction.type === "exportJson") {
        await settingsApi.exportBackupData(pendingAction.exportType);
        setMessage({ type: "success", text: "JSON export downloaded successfully." });
      } else if (pendingAction.type === "exportReport") {
        await settingsApi.exportReadableReport(pendingAction.format, pendingAction.scope);
        setMessage({
          type: "success",
          text: `${pendingAction.format.toUpperCase()} report downloaded successfully.`,
        });
      } else if (pendingAction.type === "restore") {
        const result = await settingsApi.restoreFromBackup(pendingAction.file);
        await loadStatus();
        await refresh();
        setMessage({
          type: "success",
          text: `Backup restored successfully (${result.restoredTables.length} tables).`,
        });
      } else if (pendingAction.type === "toggleAutoBackup") {
        await settingsApi.updateBackupSettings(pendingAction.next);
        setBackup(pendingAction.next);
        await refresh();
        setMessage({
          type: "success",
          text: pendingAction.next.automaticDailyBackup
            ? "Automatic daily backup enabled."
            : "Automatic daily backup disabled.",
        });
        showToast("Settings saved successfully.");
      }
      setConfirmOpen(false);
      setPendingAction(null);
    } catch (err) {
      setConfirmOpen(false);
      setPendingAction(null);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Operation failed. Please try again."),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleRestoreFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setMessage({ type: "error", text: "Please select a JSON backup file." });
      return;
    }
    openConfirm({ type: "restore", file });
  }

  function handleAutoBackupToggle(checked: boolean) {
    if (!backup) return;
    openConfirm({
      type: "toggleAutoBackup",
      next: { ...backup, automaticDailyBackup: checked },
    });
  }

  const confirmCopy = (() => {
    if (!pendingAction) {
      return { title: "Confirm action?", message: "Are you sure you want to continue?", label: "Confirm" };
    }
    switch (pendingAction.type) {
      case "backup":
        return {
          title: "Create backup?",
          message:
            "Are you sure you want to create a full backup now? A JSON file will be downloaded and the last backup time will be updated.",
          label: "Backup",
        };
      case "restore":
        return {
          title: "Restore from backup?",
          message:
            "Are you sure you want to restore from this backup? Current data will be replaced with the backup contents. This cannot be undone.",
          label: "Restore",
        };
      case "exportJson":
        return {
          title: "Export JSON data?",
          message: `Are you sure you want to export ${
            pendingAction.exportType === "all"
              ? "all application data as JSON (for system restore)"
              : pendingAction.exportType === "attendance"
                ? "attendance records as JSON"
                : "employee records as JSON"
          }?`,
          label: "Export JSON",
        };
      case "exportReport": {
        const scopeLabel =
          pendingAction.scope === "full"
            ? "a full readable report (Employees, Attendance, Leave, Holidays, Settings, Audit Logs)"
            : pendingAction.scope === "attendance"
              ? "an attendance report"
              : "an employees report";
        return {
          title: `Download ${pendingAction.format.toUpperCase()} report?`,
          message: `Are you sure you want to export ${scopeLabel} as a formatted ${pendingAction.format.toUpperCase()} file?`,
          label: `Download ${pendingAction.format.toUpperCase()}`,
        };
      }
      case "toggleAutoBackup":
        return {
          title: pendingAction.next.automaticDailyBackup
            ? "Enable automatic daily backup?"
            : "Disable automatic daily backup?",
          message: pendingAction.next.automaticDailyBackup
            ? "The system will create one full backup per day when automatic backup is enabled."
            : "Scheduled daily backups will stop. You can still create manual backups anytime.",
          label: pendingAction.next.automaticDailyBackup ? "Enable" : "Disable",
        };
    }
  })();

  if (loading || !backup) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading backup settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Database monitoring, storage capacity, and data cleanup have moved to the{" "}
        <span className="font-medium text-slate-800">Database</span> settings panel.
      </div>

      <SettingsSection title="Backup" description="Create and schedule full database backups.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">Last Backup</p>
            <p className="text-sm text-slate-500">
              {backup.lastBackupAt ? formatDateTime(backup.lastBackupAt) : "No backup recorded yet"}
            </p>
          </div>
          <Button
            type="button"
            icon={<HardDriveDownload className="h-4 w-4" />}
            onClick={() => openConfirm({ type: "backup" })}
            isLoading={busy && pendingAction?.type === "backup"}
          >
            Backup Now
          </Button>
        </div>

        <div className="mt-4">
          <ToggleRow
            label="Automatic Daily Backup"
            description="Create one full backup automatically each day. Manual backups are always available."
            checked={backup.automaticDailyBackup}
            onChange={handleAutoBackupToggle}
            disabled={busy}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Restore"
        description="Replace current data with a previously exported full JSON backup file."
      >
        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleRestoreFileChange}
        />
        <Button
          type="button"
          variant="outline"
          icon={<Upload className="h-4 w-4" />}
          onClick={() => restoreInputRef.current?.click()}
          disabled={busy}
        >
          Restore from Backup
        </Button>
      </SettingsSection>

      <SettingsSection
        title="JSON Export"
        description="Machine-readable exports for system restore and data migration. Use full JSON backups to restore the application."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            onClick={() => openConfirm({ type: "exportJson", exportType: "all" })}
            disabled={busy}
          >
            Export All Data (JSON)
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            onClick={() => openConfirm({ type: "exportJson", exportType: "attendance" })}
            disabled={busy}
          >
            Export Attendance (JSON)
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            onClick={() => openConfirm({ type: "exportJson", exportType: "employees" })}
            disabled={busy}
          >
            Export Employees (JSON)
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Readable Report"
        description="Formatted PDF or Excel reports with labeled tables for Employees, Attendance, Leave, Holidays, Settings, and Audit Logs."
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-800">Full report (all sections)</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                icon={<FileText className="h-4 w-4" />}
                onClick={() => openConfirm({ type: "exportReport", format: "pdf", scope: "full" })}
                disabled={busy}
              >
                Download PDF Report
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon={<FileSpreadsheet className="h-4 w-4" />}
                onClick={() => openConfirm({ type: "exportReport", format: "excel", scope: "full" })}
                disabled={busy}
              >
                Download Excel Report
              </Button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-medium text-slate-800">Section reports</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openConfirm({ type: "exportReport", format: "pdf", scope: "employees" })}
                disabled={busy}
              >
                Employees PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openConfirm({ type: "exportReport", format: "excel", scope: "employees" })}
                disabled={busy}
              >
                Employees Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openConfirm({ type: "exportReport", format: "pdf", scope: "attendance" })}
                disabled={busy}
              >
                Attendance PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openConfirm({ type: "exportReport", format: "excel", scope: "attendance" })}
                disabled={busy}
              >
                Attendance Excel
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.label}
        confirmVariant={pendingAction?.type === "restore" ? "danger" : "primary"}
        onCancel={closeConfirm}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
