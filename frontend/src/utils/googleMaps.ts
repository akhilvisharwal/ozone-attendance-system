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
  mapsReadyPromise = importLibrary("maps").then(() => undefined);
  await mapsReadyPromise;
}

export function resetGoogleMapsLoaderForTests(): void {
  mapsReadyPromise = null;
  loadedApiKey = null;
}
