import { useMemo } from "react";
import { usePublicSettings } from "@/contexts/SettingsContext";

export type GoogleMapsApiKeySource = "vite" | "server" | "none";

export interface GoogleMapsApiKeyState {
  apiKey: string;
  source: GoogleMapsApiKeySource;
  /** True while public settings are still loading and no build-time key exists. */
  waitingForServer: boolean;
  configured: boolean;
}

/**
 * Resolves the Google Maps JavaScript API key.
 * Prefers the Vite build-time env var; falls back to the key served by the backend.
 */
export function useGoogleMapsApiKey(): GoogleMapsApiKeyState {
  const viteKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const { publicSettings, loading } = usePublicSettings();
  const serverKey = publicSettings?.maps?.apiKey?.trim() ?? "";

  return useMemo(() => {
    if (viteKey) {
      return {
        apiKey: viteKey,
        source: "vite",
        waitingForServer: false,
        configured: true,
      };
    }
    if (serverKey) {
      return {
        apiKey: serverKey,
        source: "server",
        waitingForServer: false,
        configured: true,
      };
    }
    return {
      apiKey: "",
      source: "none",
      waitingForServer: loading,
      configured: publicSettings?.maps?.configured ?? false,
    };
  }, [viteKey, serverKey, loading, publicSettings?.maps?.configured]);
}
