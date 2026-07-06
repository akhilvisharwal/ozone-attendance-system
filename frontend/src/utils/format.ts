export interface FormatPreferences {
  timezone: string;
  timeFormat: "12h" | "24h";
  dateFormat: string;
}

let prefs: FormatPreferences = {
  timezone: "Asia/Kolkata",
  timeFormat: "12h",
  dateFormat: "DD/MM/YYYY",
};

export function configureFormatting(partial: Partial<FormatPreferences>) {
  prefs = { ...prefs, ...partial };
}

export function getFormatPreferences(): FormatPreferences {
  return prefs;
}

function localeOptions(): Intl.DateTimeFormatOptions {
  return {
    timeZone: prefs.timezone,
    hour12: prefs.timeFormat === "12h",
  };
}

export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    ...localeOptions(),
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", {
    ...localeOptions(),
    timeStyle: "short",
  });
}

export function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    ...localeOptions(),
    dateStyle: "medium",
  });
}

export function formatMinutesAsHours(totalMinutes: number | null): string {
  if (totalMinutes === null || totalMinutes === undefined) return "-";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
