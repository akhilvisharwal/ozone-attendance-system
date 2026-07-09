/**
 * Reverse geocodes GPS coordinates into a human-readable address.
 * Supports Google Geocoding API (production) and OpenStreetMap Nominatim (dev fallback).
 */
import { env } from "../config/env";

async function reverseGeocodeNominatim(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OzoneAttendanceSystem/1.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch (err) {
    console.warn("Nominatim reverse geocoding failed:", (err as Error).message);
    return null;
  }
}

async function reverseGeocodeGoogle(latitude: number, longitude: number): Promise<string | null> {
  const apiKey = env.googleMapsApiKey;
  if (!apiKey) {
    console.warn("GOOGLE_MAPS_API_KEY is not set; cannot reverse geocode with Google.");
    return null;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.warn("Google Geocoding API HTTP error:", response.status);
      return null;
    }

    const data = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: { formatted_address?: string }[];
    };

    if (data.status !== "OK") {
      console.warn("Google Geocoding API status:", data.status, data.error_message ?? "");
      return null;
    }

    return data.results?.[0]?.formatted_address ?? null;
  } catch (err) {
    console.warn("Google reverse geocoding failed:", (err as Error).message);
    return null;
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  if (env.geocodeProvider === "google") {
    const googleResult = await reverseGeocodeGoogle(latitude, longitude);
    if (googleResult) return googleResult;
    // Fall back to Nominatim if Google fails (e.g. missing key in dev).
    return reverseGeocodeNominatim(latitude, longitude);
  }

  return reverseGeocodeNominatim(latitude, longitude);
}
