import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Input, Select, Textarea, FieldWrapper } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import * as holidaysApi from "@/api/holidays";
import type { CompanyHoliday, HolidayType } from "@/api/holidays";
import { extractErrorMessage } from "@/api/client";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const HOLIDAY_FORM_ID = "holiday-form";

export function HolidayFormModal({
  open,
  onClose,
  onSaved,
  initialDate,
  editTarget,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialDate?: string;
  editTarget?: CompanyHoliday | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [holidayType, setHolidayType] = useState<HolidayType>("one_time");
  const [holidayDate, setHolidayDate] = useState("");
  const [recurringMonth, setRecurringMonth] = useState(1);
  const [recurringDay, setRecurringDay] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setName(editTarget.name);
      setDescription(editTarget.description ?? "");
      setHolidayType(editTarget.holiday_type);
      setHolidayDate(editTarget.holiday_date ?? "");
      setRecurringMonth(editTarget.recurring_month ?? 1);
      setRecurringDay(editTarget.recurring_day ?? 1);
    } else {
      setName("");
      setDescription("");
      setHolidayType("one_time");
      setHolidayDate(initialDate ?? "");
      if (initialDate) {
        const [, m, d] = initialDate.split("-").map(Number);
        setRecurringMonth(m);
        setRecurringDay(d);
      } else {
        setRecurringMonth(1);
        setRecurringDay(1);
      }
    }
    setError(null);
  }, [open, editTarget, initialDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name,
        description: description || null,
        holidayType,
        holidayDate: holidayType === "one_time" ? holidayDate : null,
        recurringMonth: holidayType === "recurring" ? recurringMonth : null,
        recurringDay: holidayType === "recurring" ? recurringDay : null,
      };

      if (editTarget) {
        await holidaysApi.updateHoliday(editTarget.id, payload);
      } else if (initialDate && holidayType === "one_time") {
        await holidaysApi.createHolidayForDate(initialDate, { name, description: description || null });
      } else {
        await holidaysApi.createHoliday(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save holiday"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editTarget ? "Edit Holiday" : initialDate ? `Mark Holiday — ${initialDate}` : "Add Holiday"}
      footer={
        <ModalFooterActions>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={HOLIDAY_FORM_ID} isLoading={saving}>
            {editTarget ? "Save Changes" : "Create Holiday"}
          </Button>
        </ModalFooterActions>
      }
    >
      <form id={HOLIDAY_FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Holiday Name / Title"
          required
          placeholder="e.g. Independence Day, Diwali, Company Annual Meet"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {!editTarget && !initialDate && (
          <Select
            label="Holiday Type"
            value={holidayType}
            onChange={(e) => setHolidayType(e.target.value as HolidayType)}
          >
            <option value="one_time">One-time (specific date)</option>
            <option value="recurring">Recurring annually (same date every year)</option>
          </Select>
        )}

        {holidayType === "one_time" ? (
          <Input
            label="Holiday Date"
            type="date"
            required
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            disabled={Boolean(initialDate && !editTarget)}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Month"
              value={recurringMonth}
              onChange={(e) => setRecurringMonth(Number(e.target.value))}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
            <Input
              label="Day"
              type="number"
              min={1}
              max={31}
              required
              value={recurringDay}
              onChange={(e) => setRecurringDay(Number(e.target.value))}
            />
          </div>
        )}

        <FieldWrapper label="Description" hint="Optional">
          <Textarea
            rows={2}
            placeholder="Additional details about this holiday"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FieldWrapper>
      </form>
    </Modal>
  );
}
