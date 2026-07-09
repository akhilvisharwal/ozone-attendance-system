import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let mapsReadyPromise: Promise<void> | null = null;
let loadedApiKey: string | null = null;

export function getGoogleMapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

export function isGoogleMapsConfigured(apiKey?: string): boolean {
  return (apiKey ?? getGoogleMapsApiKey()).length > 0;
}

/** Opens the location in the Google Maps website or app. */
export function googleMapsSearchUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function formatMapsLoadError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("referer") || lower.includes("referrernotallowed")) {
    return "Google Maps rejected this domain. Add your Vercel URL to the API key HTTP referrer restrictions in Google Cloud Console.";
  }
  if (lower.includes("invalidkey") || lower.includes("api key")) {
    return "Google Maps API key is invalid or missing required APIs (Maps JavaScript API).";
  }
  if (lower.includes("apinotactivated") || lower.includes("not activated")) {
    return "Maps JavaScript API is not enabled for this Google Cloud project.";
  }
  if (lower.includes("billing")) {
    return "Google Maps billing is not enabled for this Google Cloud project.";
  }

  return message || "Failed to load Google Maps.";
}

export async function loadGoogleMaps(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("Google Maps API key is not configured.");
  }

  if (mapsReadyPromise && loadedApiKey === key) {
    await mapsReadyPromise;
    return;
  }

  loadedApiKey = key;
  setOptions({ key, v: "weekly" });
  mapsReadyPromise = importLibrary("maps")
    .then(() => undefined)
    .catch((err) => {
      mapsReadyPromise = null;
      loadedApiKey = null;
      throw new Error(formatMapsLoadError(err));
    });
  await mapsReadyPromise;
}

export function resetGoogleMapsLoaderForTests(): void {
  mapsReadyPromise = null;
  loadedApiKey = null;
}
