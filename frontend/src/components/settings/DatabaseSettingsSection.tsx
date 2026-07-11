import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { StorageManagementSection } from "@/components/settings/StorageManagementSection";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import type {
  DatabaseStatus,
  StorageBreakdown,
  StorageCategory,
  StorageWarningLevel,
} from "@/types/settings";

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

function OverallStorageBar({
  usedLabel,
  remainingLabel,
  maxLabel,
  percent,
  level,
}: {
  usedLabel: string;
  remainingLabel: string;
  maxLabel: string;
  percent: number | null;
  level: StorageWarningLevel;
}) {
  if (percent == null) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-xs text-slate-500">
        Usage bar unavailable — the database plan limit could not be detected automatically.
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
    <div className="mt-4 space-y-2">
      <div className="h-4 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          <span className="font-medium text-slate-800">Used:</span> {usedLabel}
        </span>
        <span>
          <span className="font-medium text-slate-800">Remaining:</span> {remainingLabel}
        </span>
        <span>
          <span className="font-medium text-slate-800">Limit:</span> {maxLabel}
        </span>
      </div>
    </div>
  );
}

function recordCountLabel(category: StorageCategory): string {
  const count = category.recordCount.toLocaleString();
  if (category.storageKind === "files") {
    return `${count} file${category.recordCount === 1 ? "" : "s"}`;
  }
  return `${count} record${category.recordCount === 1 ? "" : "s"}`;
}

function formatModuleSummary(category: StorageCategory, showCapacityPercent: boolean): string {
  const base = `${category.sizeLabel} · ${recordCountLabel(category)}`;
  if (!showCapacityPercent || category.percentOfTotalCapacity == null) return base;
  return `${base} · ${category.percentOfTotalCapacity}% of capacity`;
}

function capacitySourceLabel(source: StorageBreakdown["capacity"]["limitSource"]): string {
  switch (source) {
    case "provider":
      return "Detected from hosting provider";
    case "env":
      return "From environment variable";
    default:
      return "Not available";
  }
}

export function DatabaseSettingsSection() {
  const { refresh } = useSettings();
  const [loading, setLoading] = useState(true);
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

  async function handleStorageUpdated(next: {
    status: DatabaseStatus;
    storage: StorageBreakdown;
  }) {
    setStatus(next.status);
    setStorage(next.storage);
    try {
      await refresh();
    } catch {
      // Successful storage mutations must not be rolled back by a settings refresh failure.
    }
  }

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
    <div className="space-y-6">
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
        title="Storage Analytics"
        description="Live PostgreSQL database size measured with pg_database_size, plus real uploaded file sizes on disk."
      >
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void loadStatus()}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        {!capacity.detected && (
          <Alert variant="info" className="mb-4">
            The database plan limit could not be detected automatically. Used storage below is
            accurate, but remaining space and the usage bar require a known limit.
          </Alert>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-slate-200">
              <HardDrive className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Database storage</p>
              <p className="mt-0.5 text-xs text-slate-500">{capacity.limitDescription}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Physical database size"
              value={storage.physicalDatabaseLabel ?? capacity.usedLabel}
              tone={capacityTone}
              hint="pg_database_size — bytes Postgres still reports on disk"
            />
            <StatCard
              label="Actual live data"
              value={storage.liveDataLabel ?? storage.applicationPostgresLabel}
              tone="success"
              hint="Tables that still contain rows"
            />
            <StatCard
              label="Reclaimable space"
              value={storage.reclaimableLabel ?? "0 B"}
              tone={(storage.reclaimableBytes ?? 0) > 0 ? "warning" : "default"}
              hint="Empty table files kept until VACUUM FULL / provider reclaim"
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Available"
              value={capacity.remainingLabel}
              tone={capacityTone}
              hint={
                capacity.detected
                  ? "Remaining before the plan limit"
                  : "Requires a detected plan limit"
              }
            />
            <StatCard
              label="Plan limit"
              value={capacity.maxLabel}
              hint={capacitySourceLabel(capacity.limitSource)}
            />
            <StatCard
              label="Uploaded files"
              value={storage.uploadedFilesLabel}
              hint={
                (storage.orphanedUploadFileCount ?? 0) > 0
                  ? `${storage.orphanedUploadFileCount} orphaned file(s) · ${storage.orphanedUploadFilesLabel}`
                  : "On-disk upload storage"
              }
            />
          </div>

          <OverallStorageBar
            usedLabel={capacity.usedLabel}
            remainingLabel={capacity.remainingLabel}
            maxLabel={capacity.maxLabel}
            percent={capacity.percentUsed}
            level={capacity.warningLevel}
          />

          {storage.reclaimableBytes > 0 && (
            <Alert variant="info" className="mt-4">
              {storage.reclaimableExplanation}
            </Alert>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Combined footprint (physical database + uploads):{" "}
            <span className="font-medium text-slate-700">{storage.totalStorageUsedLabel}</span>
            {" · "}
            Application data (live tables + referenced files):{" "}
            <span className="font-medium text-slate-700">{storage.applicationDataLabel}</span>
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Database Health"
        description="Connection health and high-level record counts."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Health"
            value={status.health === "healthy" ? "Healthy" : "Unhealthy"}
            tone={status.health === "healthy" ? "success" : "danger"}
          />
          <StatCard label="Database size" value={status.databaseSizeLabel} />
          <StatCard label="Employees" value={status.totalEmployees.toLocaleString()} />
          <StatCard
            label="Attendance records"
            value={status.totalAttendanceRecords.toLocaleString()}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Storage by Module"
        description="Each module shows its real storage size and record count. Percentages are relative to the database plan limit, not to other modules."
      >
        {storage.categories.length === 0 ? (
          <p className="text-sm text-slate-500">No module storage data available yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {storage.categories.map((category) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{category.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
                </div>
                <p className="text-sm font-medium text-slate-800">
                  {formatModuleSummary(category, capacity.detected)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {storage.internalDatabaseBytes > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            PostgreSQL also uses {storage.internalDatabaseLabel} ({storage.internalDatabasePercent}%
            of database size) for indexes, system catalogs, and internal overhead. This is not
            shown as a separate module.
          </p>
        )}

        <details className="mt-4 rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-800">
            Table-level detail
          </summary>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Table</th>
                  <th className="px-3 py-2 font-semibold">Records</th>
                  <th className="px-3 py-2 font-semibold">Size</th>
                  {capacity.detected && (
                    <th className="px-3 py-2 font-semibold">% of capacity</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {storage.tables.map((table) => (
                  <tr key={table.name} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{table.name}</td>
                    <td className="px-3 py-2 text-slate-600">{table.recordCount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-600">{table.sizeLabel}</td>
                    {capacity.detected && (
                      <td className="px-3 py-2 text-slate-600">
                        {table.percentOfTotalCapacity == null
                          ? "—"
                          : `${table.percentOfTotalCapacity}%`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </SettingsSection>

      <StorageManagementSection
        storage={storage}
        status={status}
        onStorageUpdated={(next) => void handleStorageUpdated(next)}
      />
    </div>
  );
}
