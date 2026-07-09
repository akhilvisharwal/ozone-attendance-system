/** Shared 12-hour display formatting for reports and exports. */

import { getSettings } from "../modules/settings/settings.cache";

function displayLocaleOptions(): Intl.DateTimeFormatOptions {
  let timeZone: string | undefined;
  try {
    timeZone = getSettings().company.timezone;
  } catch {
    timeZone = undefined;
  }

  return {
    timeZone,
    hour12: true,
  };
}

export function formatDisplayDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en-IN", {
    ...displayLocaleOptions(),
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function formatDisplayTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString("en-IN", {
    ...displayLocaleOptions(),
    hour: "numeric",
    minute: "2-digit",
  });
}
