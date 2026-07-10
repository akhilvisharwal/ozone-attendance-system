import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Eye,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { DataCleanupConfirmModal } from "@/components/settings/DataCleanupConfirmModal";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { EmptyState, Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { formatDateTime } from "@/utils/format";
import { EmailOtpModal } from "@/components/EmailOtpModal";
import type {
  AuditActionType,
  AuditLogEntry,
  AuditModule,
  AuditRetentionDays,
  AuditStatus,
} from "@/types/settings";

const DEFAULT_MODULES: AuditModule[] = [
  "Auth",
  "Employees",
  "Attendance",
  "Leave",
  "Sites",
  "Holidays",
  "Settings",
  "Database",
  "Security",
  "Tasks",
  "Reports",
  "Other",
];

const DEFAULT_ACTION_TYPES: AuditActionType[] = [
  "Create",
  "Update",
  "Delete",
  "Login",
  "Logout",
  "Attendance",
  "Leave Approval",
  "Settings Change",
  "Manual Attendance",
  "Task Update",
  "Export",
  "Backup",
  "Restore",
  "Cleanup",
  "Password Change",
  "Other",
];

const DEFAULT_RETENTION: AuditRetentionDays[] = [30, 60, 90, 365];
const AUTO_REFRESH_MS = 30_000;
const LIMIT = 25;

function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  if (role === "admin") return "Master Admin";
  if (role === "junior_admin") return "Junior Admin";
  if (role === "manager") return "Manager";
  return "Employee";
}

function shortenUserAgent(ua: string | null): string {
  if (!ua) return "—";
  if (ua.length <= 48) return ua;
  return `${ua.slice(0, 45)}…`;
}

export function AuditSettingsSection() {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actorId, setActorId] = useState("");
  const [module, setModule] = useState<AuditModule | "">("");
  const [actionType, setActionType] = useState<AuditActionType | "">("");
  const [status, setStatus] = useState<AuditStatus | "">("");

  const [modules, setModules] = useState<AuditModule[]>(DEFAULT_MODULES);
  const [actionTypes, setActionTypes] = useState<AuditActionType[]>(DEFAULT_ACTION_TYPES);
  const [retentionOptions, setRetentionOptions] =
    useState<AuditRetentionDays[]>(DEFAULT_RETENTION);
  const [retentionDays, setRetentionDays] = useState<AuditRetentionDays>(90);
  const [pendingRetention, setPendingRetention] = useState<AuditRetentionDays | null>(null);
  const [savingRetention, setSavingRetention] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearOtpOpen, setClearOtpOpen] = useState(false);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const requestIdRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  const currentFilters = useCallback(
    () => ({
      search: debouncedSearch || undefined,
      from: from || undefined,
      to: to || undefined,
      actorId: actorId || undefined,
      module: module || undefined,
      actionType: actionType || undefined,
      status: status || undefined,
    }),
    [debouncedSearch, from, to, actorId, module, actionType, status]
  );

  const loadLogs = useCallback(
    async (nextPage = page, silent = false) => {
      if (from && to && from > to) {
        setMessage({ type: "error", text: "The From date must be on or before the To date." });
        setLogs([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      if (!silent) setLoading(true);

      try {
        const res = await settingsApi.fetchAuditLogs({
          ...currentFilters(),
          page: nextPage,
          limit: LIMIT,
        });
        if (requestId !== requestIdRef.current) return;

        setLogs(res.logs);
        setTotal(res.total);
        setTotalAll(res.totalAll);
        setPage(res.page);
        setRetentionDays(res.retentionDays);
        if (res.modules?.length) setModules(res.modules);
        if (res.actionTypes?.length) setActionTypes(res.actionTypes);
        if (res.retentionOptions?.length) setRetentionOptions(res.retentionOptions);
        if (!silent) setMessage(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setMessage({ type: "error", text: extractErrorMessage(err) });
        setLogs([]);
        setTotal(0);
      } finally {
        if (requestId === requestIdRef.current && !silent) setLoading(false);
      }
    },
    [page, from, to, currentFilters]
  );

  useEffect(() => {
    void loadLogs(page);
    // Intentionally depend on filter fields rather than loadLogs identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter-driven reload
  }, [page, debouncedSearch, from, to, actorId, module, actionType, status]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void loadLogs(page, true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, page, debouncedSearch, from, to, actorId, module, actionType, status]);

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setFrom("");
    setTo("");
    setActorId("");
    setModule("");
    setActionType("");
    setStatus("");
    setPage(1);
  }

  async function handleSaveRetention() {
    if (pendingRetention == null) return;
    const next = pendingRetention;
    setSavingRetention(true);
    setMessage(null);
    try {
      await settingsApi.updateAuditRetentionDays(next);
      setRetentionDays(next);
      setPendingRetention(null);
      setMessage({
        type: "success",
        text: `Audit logs older than ${next} days will be deleted automatically.`,
      });
      showToast("Settings saved successfully.");
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err) });
    } finally {
      setSavingRetention(false);
    }
  }

  async function handleExport(format: "pdf" | "excel") {
    setExporting(format);
    setMessage(null);
    try {
      await settingsApi.exportAuditLogs(format, currentFilters());
      setMessage({
        type: "success",
        text: `Audit logs exported as ${format === "pdf" ? "PDF" : "Excel"}.`,
      });
    } catch (err) {
      setMessage({ type: "error", text: extractErrorMessage(err) });
    } finally {
      setExporting(null);
    }
  }

  async function handleClear() {
    setClearOpen(false);
    setClearOtpOpen(true);
  }

  async function handleClearOtpVerified(otp: { otpChallengeId: string; otpCode: string }) {
    setMessage(null);
    try {
      const result = await settingsApi.clearAuditLogs({
        confirmation: "DELETE",
        ...otp,
      });
      setClearOtpOpen(false);
      setMessage({
        type: "success",
        text: `Cleared ${result.deletedRecords} audit log${result.deletedRecords === 1 ? "" : "s"}.`,
      });
      await loadLogs(1);
    } catch (err) {
      throw err;
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-8">
      {message && (
        <Alert variant={message.type === "success" ? "success" : "error"}>{message.text}</Alert>
      )}

      <SettingsSection
        title="Audit log retention"
        description="Automatically delete logs older than the selected period. Changes apply on the next retention run."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-[12rem] flex-1">
            <Select
              label="Retention period"
              value={String(retentionDays)}
              onChange={(e) => {
                const next = Number(e.target.value) as AuditRetentionDays;
                if (next === retentionDays) return;
                setPendingRetention(next);
              }}
              disabled={savingRetention}
            >
              {retentionOptions.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </Select>
          </div>
          <p className="pb-2 text-xs text-slate-500">
            {totalAll.toLocaleString()} log{totalAll === 1 ? "" : "s"} stored
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Activity history"
        description="Read-only record of important actions. Use filters to narrow results, then export or inspect details."
      >
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Keyword, user, IP, action…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none ring-brand-500/0 transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>
            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
            <Input
              label="To"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
            <EmployeeCombobox
              label="User"
              value={actorId}
              onChange={(id) => {
                setActorId(id);
                setPage(1);
              }}
              hideHint
            />
            <Select
              label="Module"
              value={module}
              onChange={(e) => {
                setModule(e.target.value as AuditModule | "");
                setPage(1);
              }}
            >
              <option value="">All modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Select
              label="Action type"
              value={actionType}
              onChange={(e) => {
                setActionType(e.target.value as AuditActionType | "");
                setPage(1);
              }}
            >
              <option value="">All actions</option>
              {actionTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as AuditStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadLogs(page)}
              disabled={loading}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Auto-refresh (30s)
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExport("pdf")}
              disabled={!!exporting || total === 0}
              isLoading={exporting === "pdf"}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExport("excel")}
              disabled={!!exporting || total === 0}
              isLoading={exporting === "excel"}
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setClearOpen(true)}
              disabled={totalAll === 0}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear logs
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="No audit logs found"
              description="Try adjusting filters, or perform an action in the system to generate a new log entry."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 sm:px-4">Date & time</th>
                      <th className="px-3 py-3 sm:px-4">User</th>
                      <th className="hidden px-3 py-3 md:table-cell sm:px-4">Role</th>
                      <th className="px-3 py-3 sm:px-4">Action</th>
                      <th className="hidden px-3 py-3 lg:table-cell sm:px-4">Module</th>
                      <th className="hidden px-3 py-3 xl:table-cell sm:px-4">Description</th>
                      <th className="px-3 py-3 sm:px-4">Status</th>
                      <th className="hidden px-3 py-3 lg:table-cell sm:px-4">IP</th>
                      <th className="px-3 py-3 text-right sm:px-4"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700 sm:px-4">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex items-center gap-2.5">
                            <EmployeeAvatar
                              name={log.actor_name ?? "System"}
                              photoPath={log.actor_profile_photo_path}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-slate-900">{log.actor_name ?? "System"}</div>
                              <div className="text-xs text-slate-500">{log.actor_code ?? "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-3 text-slate-600 md:table-cell sm:px-4">
                          {roleLabel(log.actor_role)}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="font-medium text-slate-800">{log.action_label}</div>
                          <div className="text-xs text-slate-400">{log.action_type}</div>
                        </td>
                        <td className="hidden px-3 py-3 text-slate-600 lg:table-cell sm:px-4">
                          {log.module}
                        </td>
                        <td className="hidden max-w-[14rem] truncate px-3 py-3 text-slate-600 xl:table-cell sm:px-4">
                          {log.description}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <Badge tone={log.status === "failed" ? "red" : "green"}>
                            {log.status === "failed" ? "Failed" : "Success"}
                          </Badge>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-500 lg:table-cell sm:px-4">
                          {log.ip_address ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-right sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetail(log)}
                            aria-label="View details"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="ml-1.5 hidden sm:inline">Details</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}{" "}
                  matching
                  {total !== totalAll ? ` (${totalAll.toLocaleString()} total)` : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-medium text-slate-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSaveConfirmModal
        open={pendingRetention != null}
        onCancel={() => {
          if (!savingRetention) setPendingRetention(null);
        }}
        onConfirm={() => void handleSaveRetention()}
        title="Save changes?"
        message="Are you sure you want to save these changes?"
        confirmLabel="Save"
      />

      <DataCleanupConfirmModal
        open={clearOpen}
        title="Clear all audit logs"
        description="This permanently deletes every audit log entry. This action cannot be undone. Type DELETE to confirm."
        details={[
          `${totalAll.toLocaleString()} audit log entr${totalAll === 1 ? "y" : "ies"} will be removed`,
          "Application data (employees, attendance, settings) is not affected",
        ]}
        affectedRecords={totalAll}
        onCancel={() => setClearOpen(false)}
        onConfirm={handleClear}
      />

      <EmailOtpModal
        open={clearOtpOpen}
        purpose="database_cleanup"
        onClose={() => setClearOtpOpen(false)}
        onVerified={handleClearOtpVerified}
      />

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Audit log details"
        description="Read-only record of a single administrative or user action."
        widthClassName="max-w-lg"
        footer={
          <ModalFooterActions>
            <Button type="button" variant="outline" onClick={() => setDetail(null)}>
              Close
            </Button>
          </ModalFooterActions>
        }
      >
        {detail && (
          <dl className="space-y-3 text-sm">
            <DetailRow label="Date & time" value={formatDateTime(detail.created_at)} />
            <DetailRow
              label="User"
              value={
                <span className="inline-flex items-center gap-2">
                  <EmployeeAvatar
                    name={detail.actor_name ?? "System"}
                    photoPath={detail.actor_profile_photo_path}
                    size="xs"
                  />
                  {`${detail.actor_name ?? "System"}${detail.actor_code ? ` (${detail.actor_code})` : ""}`}
                </span>
              }
            />
            <DetailRow label="Role" value={roleLabel(detail.actor_role)} />
            <DetailRow label="Action" value={detail.action_label} />
            <DetailRow label="Action code" value={detail.action} mono />
            <DetailRow label="Action type" value={detail.action_type} />
            <DetailRow label="Module" value={detail.module} />
            <DetailRow label="Description" value={detail.description} />
            <DetailRow
              label="Status"
              value={detail.status === "failed" ? "Failed" : "Success"}
            />
            <DetailRow label="IP address" value={detail.ip_address ?? "—"} mono />
            <DetailRow
              label="Device / browser"
              value={detail.user_agent ?? "—"}
              hint={detail.user_agent ? shortenUserAgent(detail.user_agent) : undefined}
            />
            {(detail.target_type || detail.target_id) && (
              <DetailRow
                label="Target"
                value={`${detail.target_type ?? "—"}${detail.target_id ? ` · ${detail.target_id}` : ""}`}
                mono
              />
            )}
            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Metadata
                </dt>
                <dd className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </dd>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 sm:grid-cols-[9rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd
        className={
          mono
            ? "break-all font-mono text-xs text-slate-700"
            : "break-words text-slate-800"
        }
        title={hint}
      >
        {value}
      </dd>
    </div>
  );
}
