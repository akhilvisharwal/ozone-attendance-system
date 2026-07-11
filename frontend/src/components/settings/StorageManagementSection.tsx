import { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, Info, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { DataCleanupConfirmModal } from "@/components/settings/DataCleanupConfirmModal";
import { EmailOtpModal } from "@/components/EmailOtpModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import type {
  CleanupCategory,
  CleanupCategorySummary,
  CleanupCenterSummary,
  DatabaseStatus,
  StorageBreakdown,
} from "@/types/settings";

type ResetPhase =
  | "idle"
  | "confirm1"
  | "otp1"
  | "confirm2"
  | "otp2"
  | "running";

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
  const reclaimableTipId = useId();
  const [cleanup, setCleanup] = useState<CleanupCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyCategory, setBusyCategory] = useState<CleanupCategory | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<CleanupCategorySummary | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [resetPhase, setResetPhase] = useState<ResetPhase>("idle");
  const [resetTyped, setResetTyped] = useState("");
  const [resetAuth, setResetAuth] = useState<{
    authorizationId: string;
    authorizationToken: string;
  } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

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
    setOtpOpen(true);
  }

  async function handleCleanupOtpVerified(otp: { otpChallengeId: string; otpCode: string }) {
    if (!confirmTarget) return;
    setBusyCategory(confirmTarget.id);
    setMessage(null);
    try {
      const result = await settingsApi.runStorageCleanup({
        category: confirmTarget.id,
        confirmation: "DELETE",
        ...otp,
      });
      onStorageUpdated({ status: result.status, storage: result.storage });
      setCleanup(result.cleanup);
      setConfirmTarget(null);
      setOtpOpen(false);
      await loadCleanup();
      setMessage({
        type: "success",
        text: `${confirmTarget.label} permanently deleted. ${result.result.deletedRecords.toLocaleString()} record(s) and ${result.result.deletedFiles.toLocaleString()} file(s) removed. Storage permanently freed: database ${formatBytes(result.result.databaseSizeRecoveredBytes)}, files ${formatBytes(result.result.uploadedFilesRecoveredBytes)}.`,
      });
    } catch (err) {
      throw err;
    } finally {
      setBusyCategory(null);
    }
  }

  function closeResetFlow() {
    if (resetPhase === "running") return;
    setResetPhase("idle");
    setResetTyped("");
    setResetAuth(null);
    setResetError(null);
  }

  async function handleResetStep1Otp(otp: { otpChallengeId: string; otpCode: string }) {
    setResetError(null);
    try {
      const auth = await settingsApi.prepareDatabaseReset({
        confirmation: "RESET",
        ...otp,
      });
      setResetAuth({
        authorizationId: auth.authorizationId,
        authorizationToken: auth.authorizationToken,
      });
      setResetTyped("");
      setResetPhase("confirm2");
    } catch (err) {
      throw err;
    }
  }

  async function handleResetStep2Otp(otp: { otpChallengeId: string; otpCode: string }) {
    if (!resetAuth) {
      setResetError("First verification expired. Start the reset again.");
      setResetPhase("confirm1");
      return;
    }
    setResetPhase("running");
    setResetError(null);
    setMessage(null);
    try {
      const result = await settingsApi.executeDatabaseReset({
        confirmation: "RESET",
        authorizationId: resetAuth.authorizationId,
        authorizationToken: resetAuth.authorizationToken,
        ...otp,
      });
      onStorageUpdated({ status: result.status, storage: result.storage });
      setCleanup(result.cleanup);
      setResetPhase("idle");
      setResetAuth(null);
      setResetTyped("");
      await loadCleanup();
      setMessage({
        type: "success",
        text: `Database reset complete. Preserved System Admin ${result.result.preservedAdminCode}. Permanently removed ${result.result.deletedEmployees.toLocaleString()} account(s), ${result.result.deletedRecords.toLocaleString()} record(s), and ${result.result.deletedFiles.toLocaleString()} file(s). Storage permanently freed: database ${formatBytes(result.result.databaseSizeRecoveredBytes)}, files ${formatBytes(result.result.uploadedFilesRecoveredBytes)}.`,
      });
    } catch (err) {
      setResetPhase("otp2");
      setResetError(extractErrorMessage(err, "Database reset failed."));
      throw err;
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

  const resetBusy = resetPhase === "running" || busyCategory != null;

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
        description="Live PostgreSQL and upload storage totals. Deleting a category permanently removes that data from the database. Employees, sites, company settings, holidays, weekly offs, and system configuration are protected."
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
                  disabled={!category.canDelete || resetBusy}
                  isLoading={busyCategory === category.id}
                  onClick={() => setConfirmTarget(category)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Storage to be Permanently Freed
                    </p>
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        className="rounded text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        aria-describedby={reclaimableTipId}
                        aria-label="About permanently freed storage"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                      <span
                        id={reclaimableTipId}
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        Estimated database and file space that will be permanently freed after
                        deletion. Deleted data cannot be recovered.
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {cleanup.totalRecoverableLabel}
                  </p>
                </div>
                <p className="max-w-sm text-xs text-slate-500">
                  Calculated from live table sizes and real file sizes on disk. Attendance storage
                  already includes linked selfie files and location data.
                </p>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <p>
                  All deleted data is permanently removed from the database and cannot be recovered.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Reset Entire Database"
        description="Permanently wipe operational data while keeping the System Administrator account and all application settings."
      >
        <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50/40">
          <div className="space-y-4 px-4 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-red-600 shadow-sm ring-1 ring-red-200">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-red-800">Irreversible full reset</p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-red-900/80">
                  <li>Deletes employees (except System Admin), attendance, leaves, tasks, expenses, sites, holidays, and related files.</li>
                  <li>Keeps the System Administrator account, company information, and all settings / security configuration.</li>
                  <li>Requires two separate email OTP verifications before anything is deleted.</li>
                  <li>All deleted data is permanently removed and cannot be recovered.</li>
                </ul>
              </div>
            </div>

            {resetPhase === "running" && (
              <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-slate-700">
                <Loader2 className="h-5 w-5 animate-spin text-red-600" aria-hidden />
                <div>
                  <p className="font-medium text-slate-900">Resetting database…</p>
                  <p className="text-xs text-slate-500">
                    Please wait. Do not close this page until the reset finishes.
                  </p>
                </div>
              </div>
            )}

            {resetError && resetPhase !== "running" && (
              <div className="rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-800">
                {resetError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={resetBusy}
                onClick={() => {
                  setResetError(null);
                  setResetTyped("");
                  setResetAuth(null);
                  setResetPhase("confirm1");
                }}
              >
                Reset Entire Database
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <DataCleanupConfirmModal
        open={Boolean(confirmTarget) && !otpOpen}
        category={confirmTarget}
        onCancel={() => {
          if (!busyCategory) setConfirmTarget(null);
        }}
        onConfirm={handleConfirmCleanup}
      />

      <EmailOtpModal
        open={otpOpen}
        purpose="database_cleanup"
        onClose={() => setOtpOpen(false)}
        onVerified={handleCleanupOtpVerified}
      />

      <Modal
        open={resetPhase === "confirm1" || resetPhase === "confirm2"}
        onClose={closeResetFlow}
        title={
          resetPhase === "confirm2"
            ? "Final confirmation — database reset"
            : "Confirm database reset"
        }
        widthClassName="max-w-[24rem] sm:max-w-md"
        layout="centered"
        compact
        footer={
          <ModalFooterActions>
            <Button type="button" variant="outline" onClick={closeResetFlow}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={resetTyped !== "RESET"}
              onClick={() => setResetPhase(resetPhase === "confirm2" ? "otp2" : "otp1")}
            >
              {resetPhase === "confirm2" ? "Continue to second OTP" : "Continue to first OTP"}
            </Button>
          </ModalFooterActions>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {resetPhase === "confirm2" ? (
              <div className="space-y-2">
                <p className="font-semibold">Last chance to cancel</p>
                <p>
                  The first email verification succeeded. Completing the second OTP will permanently
                  delete operational data. Settings and the System Administrator account will be kept.
                </p>
                <p className="font-medium">
                  This action permanently deletes the selected data from the database and cannot be
                  undone.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-semibold">Danger: irreversible wipe</p>
                <p>
                  This action permanently deletes the selected data from the database and cannot be
                  undone. All employees except the System Administrator, plus attendance, tasks,
                  expenses, sites, holidays, and related uploaded files will be removed.
                </p>
                <p>
                  Application settings, company information, and security configuration are preserved.
                </p>
              </div>
            )}
          </div>
          <Input
            label='Type RESET to confirm'
            value={resetTyped}
            onChange={(e) => setResetTyped(e.target.value)}
            placeholder="RESET"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </Modal>

      <EmailOtpModal
        open={resetPhase === "otp1"}
        purpose="database_reset_step1"
        onClose={closeResetFlow}
        onVerified={handleResetStep1Otp}
      />

      <EmailOtpModal
        open={resetPhase === "otp2"}
        purpose="database_reset_step2"
        onClose={() => {
          if (resetPhase === "running") return;
          setResetPhase("confirm2");
        }}
        onVerified={handleResetStep2Otp}
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
