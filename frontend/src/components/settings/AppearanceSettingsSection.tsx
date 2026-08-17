import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsSection, ToggleRow } from "@/components/settings/SettingsSection";
import { SettingsSaveConfirmModal } from "@/components/settings/SettingsSaveConfirmModal";
import * as settingsApi from "@/api/settings";
import { extractErrorMessage } from "@/api/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/components/ui/Toast";
import type { AppearanceSettings } from "@/types/settings";
import {
  applyGlassTheme,
  glassSettingsFromAppearance,
  glassStrengthLabel,
  GLASS_THEME_DEFAULTS,
  type GlassThemeSettings,
} from "@/lib/glassTheme";

export function AppearanceSettingsSection() {
  const { refresh } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Full appearance settings (theme/accentColor/sidebarCollapsed are preserved
  // as-is — this section only exposes the glass controls — but the whole
  // category is saved back together, same as every other settings section).
  const [full, setFull] = useState<AppearanceSettings | null>(null);
  const [glass, setGlass] = useState<GlassThemeSettings>(GLASS_THEME_DEFAULTS);
  const savedGlassRef = useRef<GlassThemeSettings>(GLASS_THEME_DEFAULTS);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const settings = await settingsApi.fetchSettings();
      setFull(settings.appearance);
      const saved = glassSettingsFromAppearance(settings.appearance);
      setGlass(saved);
      savedGlassRef.current = saved;
    } catch (err) {
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to load appearance settings."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Live preview: every drag of the slider (before saving) applies
  // immediately, mirroring ozone-inventory's GlassSection. Reverts to the
  // saved theme if the admin navigates away without saving.
  useEffect(() => {
    applyGlassTheme(glass);
  }, [glass]);

  useEffect(() => {
    return () => {
      applyGlassTheme(savedGlassRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(partial: Partial<GlassThemeSettings>) {
    setGlass((prev) => ({ ...prev, ...partial }));
    setMessage(null);
  }

  function handleSaveClick() {
    if (!full) return;
    setConfirmOpen(true);
  }

  function handleCancel() {
    setGlass(savedGlassRef.current);
    applyGlassTheme(savedGlassRef.current);
    showToast("Changes discarded.");
  }

  async function handleConfirmSave() {
    if (!full) return;

    setSaving(true);
    setMessage(null);
    try {
      const payload: AppearanceSettings = {
        ...full,
        glassEnabled: glass.enabled,
        glassIntensity: glass.intensity,
      };
      const updatedSettings = await settingsApi.updateSettingsCategory("appearance", payload);
      const updated = updatedSettings.appearance;
      setFull(updated);
      const saved = glassSettingsFromAppearance(updated);
      setGlass(saved);
      savedGlassRef.current = saved;
      applyGlassTheme(saved);
      await refresh();
      setConfirmOpen(false);
      setMessage({ type: "success", text: "Appearance settings saved successfully." });
      showToast("Settings saved successfully.");
    } catch (err) {
      setConfirmOpen(false);
      setMessage({
        type: "error",
        text: extractErrorMessage(err, "Failed to save appearance settings."),
      });
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    glass.enabled !== savedGlassRef.current.enabled ||
    glass.intensity !== savedGlassRef.current.intensity;

  const label = useMemo(
    () => glassStrengthLabel(glass.enabled ? glass.intensity : 0),
    [glass.enabled, glass.intensity]
  );

  if (loading || !full) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading appearance settings…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && <Alert variant={message.type === "error" ? "error" : "success"}>{message.text}</Alert>}

      <SettingsSection
        title="Glass Effect"
        description="Frosted glass on the sidebar, top bar, dashboard stat cards, modals, and dropdown menus. Data tables, attendance lists, and the check-in camera/GPS card always stay solid, regardless of this setting — Turning glass off (or intensity to 0) reverts every page to plain solid surfaces."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Enable glass effect"
            description="Off uses solid surfaces everywhere, identical to the classic look."
            checked={glass.enabled}
            onChange={(checked) => patch({ enabled: checked })}
          />

          <div
            className={clsx(
              "rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-soft-xs",
              !glass.enabled && "opacity-50"
            )}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <label htmlFor="glass-intensity" className="text-sm font-medium text-slate-900">
                  Glass effect intensity
                </label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Adjusts blur, transparency, border, and shadow together.
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm tabular-nums text-slate-900">{glass.intensity}%</p>
                <p className="text-[11px] text-slate-500">{label}</p>
              </div>
            </div>
            <input
              id="glass-intensity"
              type="range"
              min={0}
              max={100}
              value={glass.intensity}
              disabled={!glass.enabled}
              onChange={(e) => patch({ intensity: Number(e.target.value) })}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600 disabled:cursor-not-allowed"
            />
            <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
              <span>Solid</span>
              <span>Subtle</span>
              <span>Balanced</span>
              <span>Premium</span>
              <span>Max</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Live preview
            </p>
            <div
              className="relative overflow-hidden rounded-xl p-5"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, #bfdbfe 0%, transparent 45%), radial-gradient(circle at 80% 30%, #c7d2fe 0%, transparent 40%), linear-gradient(140deg, #eef2f9, #e3e8f3)",
              }}
            >
              <div className="glass-surface-strong glass-shadow relative mx-auto max-w-xs rounded-2xl border border-slate-200 bg-white p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                  Glass panel
                </p>
                <p className="mt-1 text-xs text-slate-500">Updates instantly as you move the slider.</p>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCancel}
          disabled={saving || !dirty}
        >
          Cancel
        </Button>
        <Button onClick={handleSaveClick} isLoading={saving && !confirmOpen} disabled={!dirty}>
          Save changes
        </Button>
      </div>

      <SettingsSaveConfirmModal
        open={confirmOpen}
        title="Save appearance settings?"
        message="This changes the glass effect for every admin and employee across the whole app."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
