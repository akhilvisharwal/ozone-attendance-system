import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Clock } from "lucide-react";
import clsx from "clsx";
import { FieldWrapper } from "./Input";
import { Button } from "./Button";
import { AnalogClockFace, type ClockMode } from "./AnalogClockFace";
import {
  formatTimeSlotLabel,
  normalizeTimeSlotValue,
  parseTime24,
  toTime24,
  type TimePeriod,
} from "@/constants/timeSlots";

const PANEL_MS = 200;

export interface TimePickerFieldProps {
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
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function TimePickerField({
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
  placeholder = "Select time",
}: TimePickerFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedValue = normalizeTimeSlotValue(value);
  const parsed = parseTime24(normalizedValue);

  const [open, setOpen] = useState(false);
  const [panelShown, setPanelShown] = useState(false);
  const [mode, setMode] = useState<ClockMode>("hour");
  const [hour12, setHour12] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<TimePeriod>(parsed.period);

  const resetDraft = useCallback(() => {
    const next = parseTime24(normalizedValue);
    setHour12(next.hour12);
    setMinute(next.minute);
    setPeriod(next.period);
    setMode("hour");
  }, [normalizedValue]);

  const closePicker = useCallback(() => {
    if (!open) return;
    setPanelShown(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      triggerRef.current?.focus();
    }, PANEL_MS);
  }, [open]);

  const openPicker = useCallback(() => {
    if (disabled) return;
    resetDraft();
    setOpen(true);
    requestAnimationFrame(() => setPanelShown(true));
  }, [disabled, resetDraft]);

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
    };
  }, []);

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

  function confirmSelection() {
    onChange(toTime24(hour12, minute, period));
    closePicker();
  }

  function handleHourInteractionEnd() {
    setMode("minute");
  }

  const displayValue = normalizedValue ? formatTimeSlotLabel(normalizedValue) : "";

  return (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <div ref={containerRef} className={clsx("relative", className)}>
        {name && required && (
          <input
            tabIndex={-1}
            aria-hidden
            name={name}
            value={normalizedValue}
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
            aria-label={open ? "Close time picker" : "Open time picker"}
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
            <Clock className={clsx("h-4 w-4 transition-transform duration-200", open && "text-brand-600")} />
          </button>
        </div>

        {open && (
          <div
            role="dialog"
            aria-label="Choose time"
            className={clsx(
              "time-picker-panel absolute left-0 top-full z-40 mt-1 w-full min-w-[300px] max-w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft-lg ring-1 ring-slate-900/5",
              panelShown ? "time-picker-panel--open" : "time-picker-panel--closed"
            )}
          >
            <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-5 pb-5 pt-4 text-white">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-100">Select time</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="flex items-end gap-1">
                  <button
                    type="button"
                    onClick={() => setMode("hour")}
                    className={clsx(
                      "rounded-lg px-2 py-1 text-4xl font-semibold tabular-nums transition-all duration-200",
                      mode === "hour" ? "bg-white/15" : "opacity-80 hover:opacity-100"
                    )}
                  >
                    {String(hour12).padStart(2, "0")}
                  </button>
                  <span className="pb-1 text-3xl font-light opacity-80">:</span>
                  <button
                    type="button"
                    onClick={() => setMode("minute")}
                    className={clsx(
                      "rounded-lg px-2 py-1 text-4xl font-semibold tabular-nums transition-all duration-200",
                      mode === "minute" ? "bg-white/15" : "opacity-80 hover:opacity-100"
                    )}
                  >
                    {pad2(minute)}
                  </button>
                </div>

                <div className="flex flex-col overflow-hidden rounded-lg border border-white/20 bg-white/10 p-0.5">
                  {(["AM", "PM"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPeriod(value)}
                      className={clsx(
                        "min-w-[3rem] rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                        period === value ? "bg-white text-brand-700 shadow-sm" : "text-white/90 hover:bg-white/10"
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-3 py-4">
              <AnalogClockFace
                mode={mode}
                hour12={hour12}
                minute={minute}
                onHourChange={setHour12}
                onMinuteChange={setMinute}
                onInteractionEnd={mode === "hour" ? handleHourInteractionEnd : undefined}
              />
              <p className="mt-2 text-center text-xs text-slate-400">
                {mode === "hour"
                  ? "Select hour, then choose minutes on the clock."
                  : "Drag the hand or tap a minute mark."}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <Button type="button" variant="ghost" size="sm" onClick={closePicker}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={confirmSelection}>
                OK
              </Button>
            </div>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}
