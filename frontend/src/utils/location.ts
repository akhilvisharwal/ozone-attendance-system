export function formatLocationSummary(
  address: string | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string {
  if (address?.trim()) {
    const trimmed = address.trim();
    return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
  }
  if (latitude != null && longitude != null) {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
  return "—";
}
