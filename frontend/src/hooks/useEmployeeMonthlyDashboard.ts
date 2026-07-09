import { useCallback, useEffect, useMemo, useState } from "react";
import * as attendanceApi from "@/api/attendance";
import type { AttendanceRecord, MonthlyGrid, TimingRules } from "@/types";
import { todayIso } from "@/utils/format";
import {
  buildExtendedMonthlyStats,
  mergeDayCells,
  monthDateRange,
  shiftMonthString,
  type ExtendedMonthlyStats,
} from "@/utils/employeeAttendanceStats";

function currentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export interface EmployeeMonthlyDashboardData {
  month: string;
  setMonth: (month: string) => void;
  grid: MonthlyGrid | null;
  records: AttendanceRecord[];
  extendedStats: ExtendedMonthlyStats | null;
  loading: boolean;
  refresh: () => void;
}

export function useEmployeeMonthlyDashboard(): EmployeeMonthlyDashboardData {
  const [month, setMonth] = useState(currentMonthString);
  const [grid, setGrid] = useState<MonthlyGrid | null>(null);
  const [streakGrid, setStreakGrid] = useState<MonthlyGrid | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [timingRules, setTimingRules] = useState<TimingRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { from, to } = monthDateRange(month);
    const streakMonth = shiftMonthString(month, -1);

    Promise.all([
      attendanceApi.getMyMonthly({ month }),
      attendanceApi.getMyMonthly({ month: streakMonth }),
      attendanceApi.getMyHistory({ from, to, limit: 31 }),
      attendanceApi.getTimingRules().then((response) => response.rules).catch(() => null),
    ])
      .then(([monthlyGrid, priorGrid, history, rules]) => {
        if (cancelled) return;
        setGrid(monthlyGrid);
        setStreakGrid(priorGrid);
        setRecords(history.items);
        setTimingRules(rules);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, refreshKey]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  const extendedStats = useMemo(() => {
    const row = grid?.employees[0];
    if (!row) return null;

    const dayMap = mergeDayCells([
      ...(streakGrid?.employees[0] ? [streakGrid.employees[0]] : []),
      row,
    ]);

    return buildExtendedMonthlyStats(
      row.summary,
      records,
      dayMap,
      todayIso(),
      timingRules?.checkoutStandardTime ?? null
    );
  }, [grid, streakGrid, records, timingRules]);

  return {
    month,
    setMonth,
    grid,
    records,
    extendedStats,
    loading,
    refresh,
  };
}
