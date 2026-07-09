import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import * as attendanceApi from "@/api/attendance";
import { usePublicSettings } from "@/contexts/SettingsContext";
import type { AttendanceRecord, TimingRules } from "@/types";
import {
  getTodayStatusToneClasses,
  resolveTodayAttendanceStatus,
} from "@/utils/todayAttendanceStatus";

export function TodayAttendanceStatusCard({
  attendance,
  className,
}: {
  attendance: AttendanceRecord | null;
  className?: string;
}) {
  const { publicSettings, refresh: refreshPublicSettings } = usePublicSettings();
  const [rules, setRules] = useState<TimingRules | null>(null);
  const [now, setNow] = useState(() => new Date());

  const loadTimingRules = useCallback(() => {
    attendanceApi
      .getTimingRules()
      .then((response) => setRules(response.rules))
      .catch(() => setRules(null));
  }, []);

  useEffect(() => {
    loadTimingRules();
  }, [loadTimingRules]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadTimingRules();
        void refreshPublicSettings();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadTimingRules, refreshPublicSettings]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const thresholds = publicSettings?.attendance ?? null;

  const presentation = useMemo(
    () => resolveTodayAttendanceStatus(attendance, rules, thresholds, now),
    [attendance, rules, thresholds, now]
  );

  if (!presentation) return null;

  const tones = getTodayStatusToneClasses(presentation.tone);
  const Icon = presentation.Icon;

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Today&apos;s Attendance Status
      </p>
      <div
        className={clsx(
          "inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2",
          tones.container
        )}
      >
        <Icon className={clsx("h-4 w-4 flex-shrink-0", tones.iconWrap)} aria-hidden="true" />
        <span className={clsx("text-sm font-semibold", tones.label)}>{presentation.label}</span>
      </div>
    </div>
  );
}
