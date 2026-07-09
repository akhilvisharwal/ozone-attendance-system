import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import type { NotificationSettings } from "@/types/settings";

type NotificationFormState = NotificationSettings;

function notificationsToForm(notifications: NotificationSettings): NotificationFormState {
  return {
    emailEnabled: notifications.emailEnabled,
    leaveApproval: notifications.leaveApproval,
    attendanceReminder: notifications.attendanceReminder,
    holidayNotifications: notifications.holidayNotifications,
  };
}

export function NotificationSettingsSection() {
  const { refresh } = useSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<NotificationFormState | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      setForm(notificationsToForm(settings.notifications));
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load notification settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateField<K extends keyof NotificationFormState>(key: K, value: NotificationFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSaveClick() {
    if (!form) return;
    setConfirmOpen(true);
  }

  async function handleConfirmSave() {
    if (!form) return;

    setSaving(true);
    setMessage(null);
    try {
      const updated = await settingsApi.updateSettingsCategory("notifications", form);
      setForm(notificationsToForm(updated.notifications));
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Notification settings saved successfully." });
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save notification settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading notification settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <SettingsSection
        title="Notification Channels"
        description="Control which notifications are sent by email and shown in the in-app notification bell."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Email Notifications"
            description="Master switch for outbound email notifications. When disabled, no notification emails are sent."
            checked={form.emailEnabled}
            onChange={(checked) => updateField("emailEnabled", checked)}
          />
          <ToggleRow
            label="Leave Approval Notifications"
            description="Notify administrators when leave is submitted and employees when leave is approved or rejected."
            checked={form.leaveApproval}
            onChange={(checked) => updateField("leaveApproval", checked)}
            disabled={!form.emailEnabled}
          />
          <ToggleRow
            label="Attendance Reminder Notifications"
            description="Send reminders to employees who have not checked in by the expected time."
            checked={form.attendanceReminder}
            onChange={(checked) => updateField("attendanceReminder", checked)}
            disabled={!form.emailEnabled}
          />
          <ToggleRow
            label="Holiday Notifications"
            description="Notify employees when company holidays are added or updated."
            checked={form.holidayNotifications}
            onChange={(checked) => updateField("holidayNotifications", checked)}
            disabled={!form.emailEnabled}
          />
        </div>
      </SettingsSection>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen}>
          Save changes
        </Button>
      </div>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        title="Save notification settings?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
