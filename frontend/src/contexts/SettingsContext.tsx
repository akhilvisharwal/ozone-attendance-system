import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AppSettings, PublicSettings } from "@/types/settings";
import * as settingsApi from "@/api/settings";
import { useAuth } from "@/auth/AuthContext";
import { configureFormatting } from "@/utils/format";
import { getStaticAssetUrl } from "@/api/client";

export type { PublicSettings };

interface SettingsContextValue {
  publicSettings: PublicSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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
    timeFormat: "12h",
    dateFormat: company.dateFormat,
  });
  if (company.name?.trim()) {
    document.title = `${company.name.trim()} | Attendance Management System`;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth();
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const employeeId = employee?.id ?? null;

  const refresh = useCallback(async () => {
    if (!employeeId) {
      setPublicSettings(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const pub = await settingsApi.fetchPublicSettings();
      setPublicSettings(pub);
      applyAppearance({ appearance: pub.appearance });
      applyCompanyMeta(pub.company);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ publicSettings, loading, error, refresh }),
    [publicSettings, loading, error, refresh]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function usePublicSettings() {
  const { publicSettings, loading, refresh } = useSettings();
  return { publicSettings, loading, refresh };
}

export function useCompanyLogoUrl(): string | null {
  const { publicSettings } = useSettings();
  const path = publicSettings?.company.logoPath?.trim();
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${getStaticAssetUrl(path)}?v=${encodeURIComponent(path)}`;
}

export function useCompanyName(): string {
  const { publicSettings } = useSettings();
  return publicSettings?.company.name?.trim() || "Ozone Aircon";
}
