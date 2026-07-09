import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { DataCleanupConfirmModal } from "@/components/settings/DataCleanupConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import type {
  CleanupTarget,
  DatabaseStatus,
  StorageBreakdown,
  StorageWarningLevel,
} from "@/types/settings";

const CLEANUP_ORDER: CleanupTarget[] = [
  "attendance_records",
  "attendance_selfies",
  "attendance_location",
  "attendance_bundle",
  "audit_logs",
];

function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
  hint?: string;
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-slate-900";

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function CapacityBar({
  percent,
  level,
}: {
  percent: number | null;
  level: StorageWarningLevel;
}) {
  if (percent == null) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-500">
        Storage usage percentage is unavailable because the maximum capacity could not be
        determined automatically.
      </div>
    );
  }
  const width = Math.min(100, Math.max(0, percent));
  const barClass =
    level === "critical"
      ? "bg-red-600"
      : level === "high"
        ? "bg-orange-500"
        : level === "warning"
          ? "bg-amber-500"
          : "bg-brand-600";

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
        <span>Database storage used</span>
        <span className="font-medium text-slate-700">{percent}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>0%</span>
        <span>70%</span>
        <span>85%</span>
        <span>95%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function ModuleBar({ percent }: { percent: number | null }) {
  if (percent == null) {
    return <div className="mt-2 h-2 rounded-full bg-slate-100" />;
  }
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-brand-600 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function capacitySourceLabel(source: StorageBreakdown["capacity"]["limitSource"]): string {
  switch (source) {
    case "provider":
      return "Detected from hosting provider";
    case "env":
      return "Environment variable";
    case "unavailable":
      return "Not available";
    default:
      return "Not available";
  }
}

export function DatabaseSettingsSection() {
  const { refresh } = useSettings();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cleanupTarget, setCleanupTarget] = useState<CleanupTarget | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [storage, setStorage] = useState<StorageBreakdown | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await settingsApi.fetchDatabasePanel();
      setStatus(data.status);
      setStorage(data.storage);
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load database status."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleCleanupConfirm() {
    if (!cleanupTarget) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await settingsApi.runDataCleanup(cleanupTarget, "DELETE");
      setStatus(result.status);
      setStorage(result.storage);
      await refresh();
      setCleanupTarget(null);
      setMessage({
        type: "success",
        text: `Cleanup completed. ${result.result.deletedRecords.toLocaleString()} record(s) removed${
          result.result.deletedFiles
            ? ` and ${result.result.deletedFiles.toLocaleString()} file(s) deleted`
            : ""
        }.`,
      });
    } catch (err) {
      setCleanupTarget(null);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Cleanup failed. Please try again."),
      });
    } finally {
      setBusy(false);
    }
  }

  const cleanupPreview = cleanupTarget && storage ? storage.cleanupPreview[cleanupTarget] : null;
  const capacity = storage?.capacity;

  if (loading || !status || !storage || !capacity) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading database status…" />
      </div>
    );
  }

  const capacityTone = !capacity.detected
    ? "default"
    : capacity.warningLevel === "critical"
      ? "danger"
      : capacity.warningLevel === "high" || capacity.warningLevel === "warning"
        ? "warning"
        : "success";

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      {capacity.warnings.map((warning) => (
        <Alert
          key={warning}
          variant={capacity.warningLevel === "critical" ? "error" : "info"}
        >
          {warning}
        </Alert>
      ))}

      <SettingsSection
        title="Storage Capacity"
        description="Live PostgreSQL database size measured against the plan capacity detected automatically from the hosting provider. Local disk space is never used."
      >
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void loadStatus()}
            disabled={loading || busy}
          >
            Refresh
          </Button>
        </div>

        {!capacity.detected && (
          <Alert variant="info" className="mb-4">
            Maximum storage capacity could not be determined automatically. The current database
            size below is live and accurate, but the maximum, remaining, and percentage cannot be
            shown without a real capacity value.
          </Alert>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-slate-200">
              <HardDrive className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Capacity overview</p>
              <p className="mt-0.5 text-xs text-slate-500">{capacity.limitDescription}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Current database size"
              value={storage.databaseSizeLabel}
              hint="From PostgreSQL pg_database_size (live)"
            />
            <StatCard
              label="Maximum storage"
              value={capacity.maxLabel}
              hint={capacitySourceLabel(capacity.limitSource)}
            />
            <StatCard
              label="Remaining available"
              value={capacity.remainingLabel}
              tone={capacityTone}
              hint={
                capacity.detected
                  ? "Maximum storage minus current database size"
                  : "Requires a known maximum storage"
              }
            />
            <StatCard
              label="Storage used"
              value={capacity.percentUsed == null ? "Not available" : `${capacity.percentUsed}%`}
              tone={capacityTone}
              hint={
                capacity.detected ? "Progress against maximum storage" : "Requires a known maximum storage"
              }
            />
          </div>

          <CapacityBar percent={capacity.percentUsed} level={capacity.warningLevel} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Database Status"
        description="Live health and record counts from the connected PostgreSQL database."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Health"
            value={status.health === "healthy" ? "Healthy" : "Unhealthy"}
            tone={status.health === "healthy" ? "success" : "danger"}
          />
          <StatCard label="Database Size" value={status.databaseSizeLabel} />
          <StatCard label="Total Employees" value={status.totalEmployees.toLocaleString()} />
          <StatCard
            label="Total Attendance Records"
            value={status.totalAttendanceRecords.toLocaleString()}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Storage Breakdown"
        description="Module sizes from PostgreSQL. Selfie file sizes are measured from uploaded files and labeled separately. Percentages are of current database size."
      >
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Tracked PostgreSQL modules"
            value={storage.totalTrackedLabel}
            hint="Sum of measured module table/column storage"
          />
          <StatCard
            label="Capacity source"
            value={capacitySourceLabel(capacity.limitSource)}
          />
        </div>

        <div className="space-y-3">
          {storage.categories.map((category) => (
            <div
              key={category.id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{category.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{category.sizeLabel}</p>
                  <p className="text-xs text-slate-500">
                    {category.recordCount.toLocaleString()} records
                    {category.percentOfTotal == null
                      ? category.id === "selfies"
                        ? " · file storage"
                        : " · Unavailable"
                      : ` · ${category.percentOfTotal}% of DB`}
                  </p>
                </div>
              </div>
              <ModuleBar
                percent={category.id === "selfies" ? null : category.percentOfTotal}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Table</th>
                <th className="px-3 py-2 font-semibold">Records</th>
                <th className="px-3 py-2 font-semibold">Size</th>
                <th className="px-3 py-2 font-semibold">% of DB</th>
              </tr>
            </thead>
            <tbody>
              {storage.tables.map((table) => (
                <tr key={table.name} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{table.name}</td>
                  <td className="px-3 py-2 text-slate-600">{table.recordCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-600">{table.sizeLabel}</td>
                  <td className="px-3 py-2 text-slate-600">{table.percentOfTotal}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Data Cleanup"
        description="Safely remove disposable attendance media, location history, or audit logs. Protected configuration data cannot be deleted here."
      >
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Employees, sites, company settings, holidays, weekly offs, leave settings, and system
          configuration are protected and cannot be deleted from this panel.
        </div>
        <div className="space-y-3">
          {CLEANUP_ORDER.map((target) => {
            const preview = storage.cleanupPreview[target];
            return (
              <div
                key={target}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{preview.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{preview.description}</p>
                  <p className="mt-1 text-xs font-medium text-slate-700">
                    {preview.affectedRecords.toLocaleString()} record
                    {preview.affectedRecords === 1 ? "" : "s"} affected
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => setCleanupTarget(target)}
                  disabled={busy || preview.affectedRecords === 0}
                >
                  Delete
                </Button>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <DataCleanupConfirmModal
        open={Boolean(cleanupTarget && cleanupPreview)}
        title={cleanupPreview?.label ?? "Confirm cleanup"}
        description={cleanupPreview?.description ?? ""}
        details={cleanupPreview?.details ?? []}
        affectedRecords={cleanupPreview?.affectedRecords ?? 0}
        onCancel={() => {
          if (!busy) setCleanupTarget(null);
        }}
        onConfirm={handleCleanupConfirm}
      />
    </div>
  );
}
