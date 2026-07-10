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

export function formatDisplayDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-IN", {
      ...displayLocaleOptions(),
      dateStyle: "short",
    });
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-IN", {
    ...displayLocaleOptions(),
    dateStyle: "short",
  });
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
