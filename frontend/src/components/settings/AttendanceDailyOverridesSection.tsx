import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Copy,
  Eye,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { AttendanceOverrideFormModal } from "@/components/settings/AttendanceOverrideFormModal";
import { AttendanceOverrideViewModal } from "@/components/settings/AttendanceOverrideViewModal";
import * as overridesApi from "@/api/attendanceOverrides";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import type { AttendanceDailyOverride, AttendanceOverrideStatus, AttendanceSettings } from "@/types/settings";
import { assignmentLabel, summarizeOverrideRules } from "@/utils/attendanceOverrideDisplay";
import { formatDate, formatDateTime } from "@/utils/format";

const STATUS_STYLES: Record<AttendanceOverrideStatus, string> = {
  active: "bg-sky-50 text-sky-700 ring-sky-200",
  upcoming: "bg-violet-50 text-violet-700 ring-violet-200",
  expired: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function AttendanceDailyOverridesSection({
  defaultRules,
}: {
  defaultRules: AttendanceSettings | null;
}) {
  const { refresh: refreshPublicSettings } = useSettings();
  const [items, setItems] = useState<overridesApi.AttendanceOverrideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceDailyOverride | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<AttendanceDailyOverride | null>(null);
  const [viewing, setViewing] = useState<overridesApi.AttendanceOverrideListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await overridesApi.listAttendanceOverrides();
      setItems(rows);
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load daily overrides."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const rank = { active: 0, upcoming: 1, expired: 2 } as const;
        return rank[a.status] - rank[b.status] || b.startDate.localeCompare(a.startDate);
      }),
    [items]
  );

  async function afterMutation(successText: string) {
    setMessage({ type: "success", text: successText });
    await load();
    await refreshPublicSettings();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this daily override? Default rules will apply for those dates.")) return;
    setBusyId(id);
    setMessage(null);
    try {
      await overridesApi.deleteAttendanceOverride(id);
      await afterMutation("Daily override deleted.");
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to delete override."),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleEnabled(item: overridesApi.AttendanceOverrideListItem) {
    setBusyId(item.id);
    setMessage(null);
    try {
      await overridesApi.setAttendanceOverrideEnabled(item.id, !item.isEnabled);
      await afterMutation(item.isEnabled ? "Override disabled." : "Override enabled.");
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to update override status."),
      });
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setDuplicateFrom(null);
    setModalOpen(true);
  }

  function openEdit(item: AttendanceDailyOverride) {
    setEditing(item);
    setDuplicateFrom(null);
    setModalOpen(true);
    setViewing(null);
  }

  function openDuplicate(item: AttendanceDailyOverride) {
    setEditing(null);
    setDuplicateFrom(item);
    setModalOpen(true);
    setViewing(null);
  }

  return (
    <div className="space-y-4 border-t border-slate-100 pt-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <SettingsSection
        title="Daily Attendance Overrides"
        description="Create temporary exceptions for specific dates. Relaxed rules apply only to assigned employees on selected days and revert automatically afterward."
      >
        <div className="flex justify-end">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!defaultRules}>
            Add override
          </Button>
        </div>

        {loading ? (
          <Spinner label="Loading overrides…" />
        ) : sortedItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
            No daily overrides yet. Use this when weather, transport, or emergencies require relaxed attendance rules.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedItems.map((item) => (
              <div
                key={item.id}
                className={clsx(
                  "rounded-xl border bg-white px-4 py-4 shadow-sm",
                  item.isEnabled ? "border-slate-200" : "border-slate-200 opacity-80"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{item.reason}</p>
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1",
                          STATUS_STYLES[item.status]
                        )}
                      >
                        {item.status}
                      </span>
                      {!item.isEnabled && (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                          Disabled
                        </span>
                      )}
                    </div>

                    <div className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                      <p>
                        <span className="text-slate-400">Dates: </span>
                        {item.startDate === item.endDate
                          ? formatDate(item.startDate)
                          : `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`}
                      </p>
                      <p>
                        <span className="text-slate-400">Employees: </span>
                        {assignmentLabel(item)}
                      </p>
                      <p className="sm:col-span-2">
                        <span className="text-slate-400">Rules: </span>
                        {summarizeOverrideRules(item)}
                      </p>
                      <p>
                        <span className="text-slate-400">Created: </span>
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" title="View" onClick={() => setViewing(item)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" title="Edit" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" title="Duplicate" onClick={() => openDuplicate(item)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title={item.isEnabled ? "Disable" : "Enable"}
                      onClick={() => void handleToggleEnabled(item)}
                      isLoading={busyId === item.id}
                    >
                      {item.isEnabled ? (
                        <PowerOff className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Delete"
                      onClick={() => void handleDelete(item.id)}
                      isLoading={busyId === item.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {defaultRules && (
        <AttendanceOverrideFormModal
          open={modalOpen}
          defaultRules={defaultRules}
          initial={editing}
          duplicateFrom={duplicateFrom}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
            setDuplicateFrom(null);
          }}
          onSaved={async () => {
            setModalOpen(false);
            setEditing(null);
            setDuplicateFrom(null);
            await afterMutation("Daily override saved.");
          }}
        />
      )}

      <AttendanceOverrideViewModal
        override={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => {
          if (viewing) openEdit(viewing);
        }}
      />
    </div>
  );
}
