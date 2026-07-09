import type { ComboboxOption } from "@/components/ui/Combobox";

const TIME_SLOT_PATTERN = /^\d{2}:\d{2}$/;

export type TimePeriod = "AM" | "PM";

export interface ParsedTimeValue {
  hour12: number;
  minute: number;
  period: TimePeriod;
}

/** Parse HH:MM (24h) into 12-hour parts for the analog picker. */
export function parseTime24(hhmm: string): ParsedTimeValue {
  if (!TIME_SLOT_PATTERN.test(hhmm)) {
    return { hour12: 9, minute: 0, period: "AM" };
  }
  const [hour24, minute] = hhmm.split(":").map(Number);
  const period: TimePeriod = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, period };
}

/** Convert 12-hour parts to HH:MM (24h) storage format. */
export function toTime24(hour12: number, minute: number, period: TimePeriod): string {
  let hour24 = hour12 % 12;
  if (period === "PM") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** All times in a day at fixed intervals (default 15 minutes), as HH:MM (24h). */
export function generateTimeSlots(intervalMinutes = 15): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += intervalMinutes) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

import { formatTimeOfDay } from "@/utils/format";

/** User-facing label for a HH:MM value (12-hour clock). */
export function formatTimeSlotLabel(hhmm: string): string {
  if (!TIME_SLOT_PATTERN.test(hhmm)) return hhmm;
  return formatTimeOfDay(hhmm);
}

/** Build combobox options, preserving a legacy/off-grid selected value when needed. */
export function buildTimeSlotOptions(
  selectedValue?: string,
  intervalMinutes = 15
): ComboboxOption[] {
  const slots = new Set(generateTimeSlots(intervalMinutes));
  if (selectedValue && TIME_SLOT_PATTERN.test(selectedValue)) {
    slots.add(selectedValue);
  }

  return Array.from(slots)
    .sort()
    .map((hhmm) => ({
      value: hhmm,
      label: formatTimeSlotLabel(hhmm),
      description: hhmm,
    }));
}

export function normalizeTimeSlotValue(value: string | undefined): string {
  if (!value || !TIME_SLOT_PATTERN.test(value)) return "09:00";
  return value;
}
