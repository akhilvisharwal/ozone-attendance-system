import { TimePickerField, type TimePickerFieldProps } from "@/components/ui/TimePickerField";

/** Attendance time field backed by the analog clock picker (stores HH:MM 24h). */
export function TimeSlotCombobox(props: TimePickerFieldProps) {
  return <TimePickerField {...props} />;
}
