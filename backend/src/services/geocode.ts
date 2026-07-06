/**
 * Reverse geocodes GPS coordinates into a human-readable address.
 * Uses OpenStreetMap's Nominatim public API, which requires no API key and
 * is suitable for development/low-volume use. Swap this out for Google
 * Maps / Mapbox reverse geocoding in production for higher rate limits.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
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
    console.warn("Reverse geocoding failed:", (err as Error).message);
    return null;
  }
}
