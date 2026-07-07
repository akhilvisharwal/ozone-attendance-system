import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AppSettings, PublicSettings } from "@/types/settings";
import * as settingsApi from "@/api/settings";
import { useAuth } from "@/auth/AuthContext";
import { configureFormatting } from "@/utils/format";
import { getApiOrigin } from "@/api/client";

export type { PublicSettings };

interface SettingsContextValue {
  settings: AppSettings | null;
  publicSettings: PublicSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveCategory: <C extends keyof AppSettings>(category: C, value: AppSettings[C]) => Promise<AppSettings>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function applyAppearance(settings: Pick<AppSettings, "appearance">) {
  const root = document.documentElement;
  root.style.setProperty("--color-brand-600", settings.appearance.accentColor);
  root.style.setProperty("--color-brand-700", settings.appearance.accentColor);
  const theme = settings.appearance.theme;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function applyCompanyMeta(company: PublicSettings["company"]) {
  configureFormatting({
    timezone: company.timezone,
    timeFormat: company.timeFormat,
    dateFormat: company.dateFormat,
  });
  if (company.name?.trim()) {
    document.title = `${company.name.trim()} | Attendance Management System`;
  }
}

function toPublicSettings(s: AppSettings): PublicSettings {
  return {
    company: s.company,
    mobile: s.mobile,
    appearance: s.appearance,
    leave: {
      categories: s.leave.categories
        .filter((cat) => cat.enabled)
        .map((cat) => ({ name: cat.name, yearlyLimit: cat.yearlyLimit })),
      halfDayAllowed: s.leave.halfDayAllowed,
      approvalRequired: s.leave.approvalRequired,
    },
    weeklyOff: s.weeklyOff,
    employee: s.employee,
    attendance: {
      allowManualOverride: s.attendance.allowManualOverride,
      minHoursPresent: s.attendance.minHoursPresent,
      minHoursHalfDay: s.attendance.minHoursHalfDay,
    },
    reports: { defaultFormat: s.reports.defaultFormat },
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!employee) {
      setSettings(null);
      setPublicSettings(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (employee.role === "admin") {
        const s = await settingsApi.fetchSettings();
        setSettings(s);
        setPublicSettings(toPublicSettings(s));
        applyAppearance(s);
        applyCompanyMeta(s.company);
      } else {
        const pub = await settingsApi.fetchPublicSettings();
        setPublicSettings(pub);
        applyAppearance({ appearance: pub.appearance });
        applyCompanyMeta(pub.company);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [employee?.role, employee?.id]);

  useEffect(() => {
    refresh();
  }, [employee, refresh]);

  const saveCategory = useCallback(async <C extends keyof AppSettings>(category: C, value: AppSettings[C]) => {
    const updated = await settingsApi.updateSettingsCategory(category, value);
    setSettings(updated);
    setPublicSettings(toPublicSettings(updated));
    if (category === "appearance") applyAppearance(updated);
    if (category === "company") applyCompanyMeta(updated.company);
    return updated;
  }, []);

  const value = useMemo(
    () => ({ settings, publicSettings, loading, error, refresh, saveCategory }),
    [settings, publicSettings, loading, error, refresh, saveCategory]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function usePublicSettings() {
  const { publicSettings, loading } = useSettings();
  return { publicSettings, loading };
}

export function useCompanyLogoUrl(): string | null {
  const { publicSettings } = useSettings();
  const path = publicSettings?.company.logoPath?.trim();
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const apiBase = getApiOrigin();
  return apiBase ? `${apiBase}/${path.replace(/^\/+/, "")}?v=${encodeURIComponent(path)}` : null;
}

export function useCompanyName(): string {
  const { publicSettings } = useSettings();
  return publicSettings?.company.name?.trim() || "Ozone Aircon";
}
