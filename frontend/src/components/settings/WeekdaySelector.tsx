import clsx from "clsx";
import { WEEKDAY_OPTIONS } from "@/types/settings";
import { normalizeWeeklyOffDays } from "@/utils/weeklyOffDays";

export function WeekdaySelector({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  const selected = normalizeWeeklyOffDays(value);

  function toggle(day: number) {
    if (disabled) return;
    const next = selected.includes(day)
      ? selected.filter((value) => value !== day)
      : normalizeWeeklyOffDays([...selected, day]);
    onChange(next);
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {WEEKDAY_OPTIONS.map((weekday) => {
        const active = selected.includes(weekday.value);
        return (
          <button
            key={weekday.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={weekday.longLabel}
            onClick={() => toggle(weekday.value)}
            className={clsx(
              "flex min-h-[2.75rem] flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm font-semibold transition-colors",
              disabled && "cursor-not-allowed opacity-60",
              active
                ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            {weekday.label}
          </button>
        );
      })}
    </div>
  );
}
