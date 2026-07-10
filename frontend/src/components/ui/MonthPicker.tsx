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

const PANEL_MS = 200;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthPickerProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  /** Emphasize the trigger label (month navigator toolbar). */
  emphasis?: boolean;
}

function parseIsoMonth(iso: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function toIsoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function currentMonthParts(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function formatDisplayMonth(iso: string): string {
  const parts = parseIsoMonth(iso);
  if (!parts) return "";
  return `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}

export function MonthPicker({
  label,
  error,
  hint,
  required,
  className,
  value,
  onChange,
  disabled = false,
  id,
  name,
  placeholder = "Select month",
  emphasis = false,
}: MonthPickerProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialView = parseIsoMonth(value) ?? currentMonthParts();
  const [open, setOpen] = useState(false);
  const [panelShown, setPanelShown] = useState(false);
  const [viewYear, setViewYear] = useState(initialView.year);

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
    const parts = parseIsoMonth(value) ?? currentMonthParts();
    setViewYear(parts.year);
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

  function selectMonth(month: number) {
    onChange(toIsoMonth(viewYear, month));
    closePicker();
  }

  const selected = parseIsoMonth(value);
  const today = currentMonthParts();
  const displayValue = value ? formatDisplayMonth(value) : "";

  const field = (
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
            "min-h-[42px] flex-1 truncate px-3 py-2 text-left sm:min-h-[38px]",
            emphasis ? "text-base font-semibold sm:text-sm" : "text-sm",
            displayValue ? "text-slate-900" : "text-slate-400",
            disabled && "cursor-not-allowed text-slate-400"
          )}
        >
          {displayValue || placeholder}
        </button>

        <button
          type="button"
          disabled={disabled}
          aria-label={open ? "Close month picker" : "Open month picker"}
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
          aria-label="Choose month"
          className={clsx(
            "date-picker-panel absolute left-0 top-full z-40 mt-1 w-full min-w-[280px] max-w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-soft-md",
            panelShown ? "date-picker-panel--open" : "date-picker-panel--closed"
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setViewYear((year) => year - 1)}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-slate-800">{viewYear}</p>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setViewYear((year) => year + 1)}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {MONTH_SHORT.map((shortLabel, index) => {
              const month = index + 1;
              const iso = toIsoMonth(viewYear, month);
              const isSelected = selected?.year === viewYear && selected.month === month;
              const isCurrent =
                today.year === viewYear && today.month === month;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectMonth(month)}
                  className={clsx(
                    "rounded-md px-2 py-2.5 text-sm transition-colors duration-150",
                    isSelected && "bg-brand-600 font-semibold text-white",
                    !isSelected && isCurrent && "border border-brand-200 bg-brand-50 font-medium text-brand-700",
                    !isSelected && !isCurrent && "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(toIsoMonth(today.year, today.month));
                closePicker();
              }}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              This month
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (label || error || hint || required) {
    return (
      <FieldWrapper label={label} error={error} hint={hint} required={required}>
        {field}
      </FieldWrapper>
    );
  }

  return field;
}
