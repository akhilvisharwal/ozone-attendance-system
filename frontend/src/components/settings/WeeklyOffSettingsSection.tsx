import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarHeart, CalendarOff, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { WeekdaySelector } from "@/components/settings/WeekdaySelector";
import { WeeklyOffSaveConfirmModal } from "@/components/settings/WeeklyOffSaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import type { WeeklyOffSettings } from "@/types/settings";
import { formatWeeklyOffSummary, normalizeWeeklyOffDays, weeklyOffDaysEqual } from "@/utils/weeklyOffDays";

const RELATED_LINKS = [
  {
    to: "/admin/holidays",
    title: "Holiday Management",
    description: "Configure company holidays and public off days.",
    icon: CalendarHeart,
  },
  {
    to: "/admin/employees",
    title: "Employee Weekly Off",
    description: "Set custom weekly off schedules for individual employees.",
    icon: CalendarOff,
  },
] as const;

export function WeeklyOffSettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savedDays, setSavedDays] = useState<number[]>([0]);
  const [selectedDays, setSelectedDays] = useState<number[]>([0]);

  const loadWeeklyOffSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      const days = normalizeWeeklyOffDays(settings.weeklyOff.defaultWeeklyOffDays ?? []);
      setSavedDays(days);
      setSelectedDays(days);
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load weekly off settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeeklyOffSettings();
  }, [loadWeeklyOffSettings]);

  const hasChanges = useMemo(
    () => !weeklyOffDaysEqual(savedDays, selectedDays),
    [savedDays, selectedDays]
  );

  function handleSaveClick() {
    if (!hasChanges) return;
    setConfirmOpen(true);
  }

  async function handleConfirmSave() {
    setSaving(true);
    setMessage(null);
    try {
      const payload: WeeklyOffSettings = {
        defaultWeeklyOffDays: normalizeWeeklyOffDays(selectedDays),
      };
      const updated = await settingsApi.updateSettingsCategory("weeklyOff", payload);
      const days = normalizeWeeklyOffDays(updated.weeklyOff.defaultWeeklyOffDays);
      setSavedDays(days);
      setSelectedDays(days);
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Default weekly off updated successfully." });
      showToast("Settings saved successfully.");
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save weekly off settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading weekly off settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <SettingsSection
        title="Default Weekly Off"
        description="Choose the standard non-working days for new employees and anyone still using the company default schedule."
      >
        <div className="space-y-4">
          <WeekdaySelector value={selectedDays} onChange={setSelectedDays} disabled={saving} />
          <p className="text-sm text-slate-500">{formatWeeklyOffSummary(selectedDays)}</p>
          <p className="text-xs leading-relaxed text-slate-400">
            Employees without a custom weekly off automatically follow this default whenever attendance
            is calculated. Custom employee schedules are managed from the Employees page.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Related Configuration"
        description="Manage holidays and per-employee weekly off overrides elsewhere in the admin panel."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {RELATED_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-white group-hover:text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </SettingsSection>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen} disabled={!hasChanges || saving}>
          Save Changes
        </Button>
      </div>

      <WeeklyOffSaveConfirmModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
