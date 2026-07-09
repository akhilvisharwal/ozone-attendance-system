import { usePublicSettings } from "@/contexts/SettingsContext";

/**
 * Resolves the Google Maps JavaScript API key.
 * Prefers the Vite build-time env var; falls back to the key served by the backend.
 */
export function useGoogleMapsApiKey(): string {
  const viteKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const { publicSettings } = usePublicSettings();
  const serverKey = publicSettings?.maps?.apiKey?.trim() ?? "";
  return viteKey || serverKey;
}
