import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import type { ReportsSettings } from "@/types/settings";

export function ReportsSettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<ReportsSettings | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      setForm({
        ...settings.reports,
        requireSignatureOnAttendancePdfs: Boolean(settings.reports.requireSignatureOnAttendancePdfs),
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load report settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleConfirmSave() {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await settingsApi.updateSettingsCategory("reports", form);
      setForm({
        ...updated.reports,
        requireSignatureOnAttendancePdfs: Boolean(updated.reports.requireSignatureOnAttendancePdfs),
      });
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Report settings saved successfully." });
      showToast("Settings saved successfully.");
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save report settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <Spinner label="Loading report settings…" />;
  }

  return (
    <div className="space-y-6">
      {message && <Alert variant={message.type === "success" ? "success" : "error"}>{message.text}</Alert>}

      <SettingsSection
        title="Attendance PDFs"
        description="Control whether monthly attendance PDFs must include an authorized signature before download."
      >
        <ToggleRow
          label="Require signature on attendance PDFs"
          description="When enabled, PDF (Detailed) and PDF (Simple) downloads are blocked until a drawn, uploaded, or saved signature is added on the Monthly Attendance page."
          checked={form.requireSignatureOnAttendancePdfs}
          onChange={(checked) => setForm((prev) => (prev ? { ...prev, requireSignatureOnAttendancePdfs: checked } : prev))}
        />
      </SettingsSection>

      <div className="flex justify-end">
        <Button onClick={() => setConfirmOpen(true)} isLoading={saving}>
          Save report settings
        </Button>
      </div>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        title="Save report settings?"
        message="This updates company-wide attendance PDF rules for every authorized user."
        confirmLabel="Save"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => handleConfirmSave()}
      />
    </div>
  );
}
