import { useEffect, useState } from "react";
import { Bell, BellOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { usePushNotifications } from "@/push/PushNotificationsProvider";
import type { PushPreferences } from "@/api/push";
import { extractErrorMessage } from "@/api/client";

type PrefForm = Omit<PushPreferences, "securityAlerts" | "updatedAt">;

export function NotificationPreferencesSection() {
  const {
    configured,
    permission,
    pushEnabled,
    preferences,
    loading,
    refreshing,
    enablePush,
    disablePush,
    savePreferences,
  } = usePushNotifications();

  const [form, setForm] = useState<PrefForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!preferences) return;
    setForm({
      soundEnabled: preferences.soundEnabled,
      vibrationEnabled: preferences.vibrationEnabled,
      attendanceReminders: preferences.attendanceReminders,
      taskNotifications: preferences.taskNotifications,
      leaveNotifications: preferences.leaveNotifications,
      expenseNotifications: preferences.expenseNotifications,
    });
    setDirty(false);
  }, [preferences]);

  function updateField<K extends keyof PrefForm>(key: K, value: PrefForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  }

  async function handleSave() {
    if (!form) return;
    setError(null);
    try {
      await savePreferences(form);
      setDirty(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save notification preferences."));
    }
  }

  if (loading && !form) {
    return (
      <SettingsSection title="Notification Preferences" description="Loading preferences…">
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Notification Preferences"
      description="Control push alerts on this device. Security alerts always stay on."
    >
      <div className="space-y-3">
        {!configured && (
          <Alert variant="info">
            Push notifications are not configured on the server yet. In-app notifications in the bell
            icon still work normally.
          </Alert>
        )}

        {configured && permission === "unsupported" && (
          <Alert variant="info">This browser does not support web push notifications.</Alert>
        )}

        {configured && permission !== "unsupported" && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {pushEnabled ? "Push notifications are on" : "Push notifications are off"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Works while the app is open, in the background, and when installed as a PWA. Uses your
                device&apos;s default notification sound.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {pushEnabled ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={<BellOff className="h-4 w-4" />}
                  onClick={() => void disablePush()}
                >
                  Disable
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  icon={<Bell className="h-4 w-4" />}
                  onClick={() => void enablePush()}
                >
                  Enable
                </Button>
              )}
            </div>
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {form && (
          <>
            <ToggleRow
              label="Notification sound"
              description="Play the device default notification sound (short and soft)."
              checked={form.soundEnabled}
              onChange={(checked) => updateField("soundEnabled", checked)}
            />
            <ToggleRow
              label="Vibration"
              description="Use a short vibration pattern when the device supports it."
              checked={form.vibrationEnabled}
              onChange={(checked) => updateField("vibrationEnabled", checked)}
            />
            <ToggleRow
              label="Attendance reminders"
              description="Reminders when you have not checked in."
              checked={form.attendanceReminders}
              onChange={(checked) => updateField("attendanceReminders", checked)}
            />
            <ToggleRow
              label="Task notifications"
              description="New assignments, updates, comments, and due-date reminders."
              checked={form.taskNotifications}
              onChange={(checked) => updateField("taskNotifications", checked)}
            />
            <ToggleRow
              label="Leave notifications"
              description="Leave approvals and rejections."
              checked={form.leaveNotifications}
              onChange={(checked) => updateField("leaveNotifications", checked)}
            />
            <ToggleRow
              label="Expense notifications"
              description="Expense approval and rejection updates."
              checked={form.expenseNotifications}
              onChange={(checked) => updateField("expenseNotifications", checked)}
            />

            <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-soft-xs">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Security alerts</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  OTP verification and security events (account changes, deletions, password changes,
                  database reset) cannot be disabled.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                Always on
              </span>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                onClick={() => void handleSave()}
                isLoading={refreshing}
                disabled={!dirty || refreshing}
              >
                Save preferences
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
