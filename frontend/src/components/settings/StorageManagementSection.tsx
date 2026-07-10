import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { DataCleanupConfirmModal } from "@/components/settings/DataCleanupConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import type {
  CleanupCategory,
  CleanupCategorySummary,
  CleanupCenterSummary,
  DatabaseStatus,
  StorageBreakdown,
} from "@/types/settings";

export function StorageManagementSection({
  storage,
  status,
  onStorageUpdated,
}: {
  storage: StorageBreakdown;
  status: DatabaseStatus;
  onStorageUpdated: (next: {
    status: DatabaseStatus;
    storage: StorageBreakdown;
  }) => void;
}) {
  const [cleanup, setCleanup] = useState<CleanupCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyCategory, setBusyCategory] = useState<CleanupCategory | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<CleanupCategorySummary | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadCleanup = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await settingsApi.fetchCleanupCenter();
      setCleanup(summary);
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load storage cleanup totals."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCleanup();
  }, [loadCleanup]);

  async function handleConfirmCleanup() {
    if (!confirmTarget) return;
    setBusyCategory(confirmTarget.id);
    setMessage(null);
    try {
      const result = await settingsApi.runStorageCleanup({
        category: confirmTarget.id,
        confirmation: "DELETE",
      });
      onStorageUpdated({ status: result.status, storage: result.storage });
      setCleanup(result.cleanup);
      setConfirmTarget(null);
      await loadCleanup();
      setMessage({
        type: "success",
        text: `${confirmTarget.label} cleaned up. ${result.result.deletedRecords.toLocaleString()} record(s) and ${result.result.deletedFiles.toLocaleString()} file(s) removed. Storage reclaimed: database ${formatBytes(result.result.databaseSizeRecoveredBytes)}, files ${formatBytes(result.result.uploadedFilesRecoveredBytes)}.`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Cleanup failed."),
      });
    } finally {
      setBusyCategory(null);
    }
  }

  if (loading && !cleanup) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Loading storage cleanup…" />
      </div>
    );
  }

  if (!cleanup) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Storage cleanup totals could not be loaded. Refresh the page or contact an administrator.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Database size" value={storage.databaseSizeLabel} />
        <SummaryTile label="Uploaded files" value={storage.uploadedFilesLabel} />
        <SummaryTile label="Employees" value={status.totalEmployees.toLocaleString()} />
        <SummaryTile
          label="Attendance records"
          value={status.totalAttendanceRecords.toLocaleString()}
        />
      </div>

      <SettingsSection
        title="Storage Cleanup Center"
        description="Live PostgreSQL and upload storage totals. Delete only frees storage for the selected category. Employees, sites, company settings, holidays, weekly offs, and system configuration are protected."
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {cleanup.categories.map((category) => (
              <li
                key={category.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{category.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">
                      {category.recordCount.toLocaleString()}
                    </span>{" "}
                    record{category.recordCount === 1 ? "" : "s"}
                    {category.fileCount > 0 && (
                      <>
                        {" · "}
                        <span className="font-medium text-slate-900">
                          {category.fileCount.toLocaleString()}
                        </span>{" "}
                        file{category.fileCount === 1 ? "" : "s"}
                      </>
                    )}
                    {" · "}
                    <span className="font-medium text-slate-900">{category.totalLabel}</span>
                    {(category.databaseBytes > 0 || category.fileBytes > 0) && (
                      <span className="text-slate-500">
                        {" "}
                        (
                        {category.databaseBytes > 0 && `${category.databaseLabel} database`}
                        {category.databaseBytes > 0 && category.fileBytes > 0 && ", "}
                        {category.fileBytes > 0 && `${category.fileLabel} files`}
                        )
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="h-4 w-4" />}
                  disabled={!category.canDelete || busyCategory != null}
                  isLoading={busyCategory === category.id}
                  onClick={() => setConfirmTarget(category)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total recoverable storage
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {cleanup.totalRecoverableLabel}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Calculated from live table sizes and real file sizes on disk. Attendance
                storage already includes linked selfie files and location data.
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>

      <DataCleanupConfirmModal
        open={Boolean(confirmTarget)}
        category={confirmTarget}
        onCancel={() => {
          if (!busyCategory) setConfirmTarget(null);
        }}
        onConfirm={handleConfirmCleanup}
      />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
