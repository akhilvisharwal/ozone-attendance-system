import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { FieldWrapper } from "./Input";
import { claimDatePickerOpen, releaseDatePickerOpen } from "./datePickerState";
import { getFormatPreferences } from "@/utils/format";

const PANEL_MS = 200;
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface DatePickerProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayParts(): { year: number; month: number; day: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function compareIso(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function formatDisplayDate(iso: string): string {
  const parts = parseIsoDate(iso);
  if (!parts) return "";

  const { dateFormat } = getFormatPreferences();
  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  const yyyy = String(parts.year);

  switch (dateFormat) {
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
    case "DD/MM/YYYY":
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function DatePicker({
  label,
  error,
  hint,
  required,
  className,
  value,
  onChange,
  min,
  max,
  disabled = false,
  id,
  name,
  placeholder = "Select date",
}: DatePickerProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialView = parseIsoDate(value) ?? todayParts();
  const [open, setOpen] = useState(false);
  const [panelShown, setPanelShown] = useState(false);
  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);

  const closePicker = useCallback(() => {
    if (!open) return;
    setPanelShown(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      releaseDatePickerOpen(closePicker);
      triggerRef.current?.focus();
    }, PANEL_MS);
  }, [open]);

  const openPicker = useCallback(() => {
    if (disabled) return;
    const parts = parseIsoDate(value) ?? todayParts();
    setViewYear(parts.year);
    setViewMonth(parts.month);
    claimDatePickerOpen(closePicker);
    setOpen(true);
    requestAnimationFrame(() => setPanelShown(true));
  }, [closePicker, disabled, value]);

  const togglePicker = useCallback(() => {
    if (open) closePicker();
    else openPicker();
  }, [closePicker, open, openPicker]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePicker();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closePicker, open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      releaseDatePickerOpen(closePicker);
    };
  }, [closePicker]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      closePicker();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openPicker();
    }
  }

  function selectDay(day: number) {
    const iso = toIsoDate(viewYear, viewMonth, day);
    if (min && compareIso(iso, min) < 0) return;
    if (max && compareIso(iso, max) > 0) return;
    onChange(iso);
    closePicker();
  }

  function shiftMonth(delta: number) {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewYear(nextYear);
    setViewMonth(nextMonth);
  }

  const today = todayParts();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const startWeekday = firstWeekday(viewYear, viewMonth);
  const cells: Array<{ day: number; muted: boolean } | null> = [];

  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) cells.push({ day, muted: false });
  while (cells.length % 7 !== 0) cells.push(null);

  const displayValue = value ? formatDisplayDate(value) : "";

  return (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <div ref={containerRef} className={clsx("relative", className)}>
        {name && required && (
          <input
            tabIndex={-1}
            aria-hidden
            name={name}
            value={value}
            required
            onChange={() => undefined}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
        )}

        <div
          className={clsx(
            "flex w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white shadow-soft-xs transition-shadow",
            "focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100",
            disabled && "cursor-not-allowed bg-slate-50",
            error && "border-red-400 focus-within:border-red-500 focus-within:ring-red-100"
          )}
        >
          <button
            ref={triggerRef}
            type="button"
            id={fieldId}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={togglePicker}
            onKeyDown={handleKeyDown}
            className={clsx(
              "min-h-[42px] flex-1 truncate px-3 py-2 text-left text-sm sm:min-h-[38px]",
              displayValue ? "text-slate-900" : "text-slate-400",
              disabled && "cursor-not-allowed text-slate-400"
            )}
          >
            {displayValue || placeholder}
          </button>

          <button
            type="button"
            disabled={disabled}
            aria-label={open ? "Close calendar" : "Open calendar"}
            onClick={(e) => {
              e.stopPropagation();
              togglePicker();
            }}
            className={clsx(
              "flex items-center justify-center border-l border-slate-200 px-3 text-slate-500 transition-colors",
              "hover:bg-slate-50 hover:text-slate-700",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-100",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <Calendar className={clsx("h-4 w-4 transition-transform duration-200", open && "text-brand-600")} />
          </button>
        </div>

        {open && (
          <div
            role="dialog"
            aria-label="Choose date"
            className={clsx(
              "date-picker-panel absolute left-0 top-full z-40 mt-1 w-full min-w-[280px] max-w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-soft-md",
              panelShown ? "date-picker-panel--open" : "date-picker-panel--closed"
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
                className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold text-slate-800">
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </p>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
                className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((labelText, index) => (
                <div
                  key={`${labelText}-${index}`}
                  className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400"
                >
                  {labelText}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, index) => {
                if (!cell) {
                  return <div key={`empty-${index}`} className="h-9" aria-hidden />;
                }

                const iso = toIsoDate(viewYear, viewMonth, cell.day);
                const isSelected = value === iso;
                const isToday =
                  today.year === viewYear && today.month === viewMonth && today.day === cell.day;
                const isDisabled =
                  (min ? compareIso(iso, min) < 0 : false) ||
                  (max ? compareIso(iso, max) > 0 : false);

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectDay(cell.day)}
                    className={clsx(
                      "h-9 rounded-md text-sm transition-colors duration-150",
                      isSelected && "bg-brand-600 font-semibold text-white",
                      !isSelected && isToday && "border border-brand-200 bg-brand-50 font-medium text-brand-700",
                      !isSelected && !isToday && !isDisabled && "text-slate-700 hover:bg-slate-100",
                      isDisabled && "cursor-not-allowed text-slate-300"
                    )}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => {
                  const iso = toIsoDate(today.year, today.month, today.day);
                  if (min && compareIso(iso, min) < 0) return;
                  if (max && compareIso(iso, max) > 0) return;
                  onChange(iso);
                  closePicker();
                }}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
              >
                Today
              </button>
            </div>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}
