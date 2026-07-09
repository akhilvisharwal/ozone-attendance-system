import { pool } from "../../config/db";
import { ScoreboardEntry } from "../../types";
import { buildAttendanceGridForRange } from "../attendance/attendance.monthly";

/**
 * Scoring (attendance + tasks only):
 *   +10  Full-day present
 *   +5   Half day
 *   +2   Approved leave day
 *   +3   Completed task
 *   −3   Late arrival
 *   −8   Absent day
 *
 * Score is floored at 0.
 */
export const SCORE_WEIGHTS = {
  present: 10,
  halfDay: 5,
  leave: 2,
  taskCompleted: 3,
  lateArrival: -3,
  absent: -8,
} as const;

export function calculateScore(input: {
  daysPresent: number;
  halfDays: number;
  absentDays: number;
  lateArrivals: number;
  leaveDays: number;
  completedTasks: number;
}): number {
  const raw =
    input.daysPresent * SCORE_WEIGHTS.present +
    input.halfDays * SCORE_WEIGHTS.halfDay +
    input.leaveDays * SCORE_WEIGHTS.leave +
    input.completedTasks * SCORE_WEIGHTS.taskCompleted +
    input.lateArrivals * SCORE_WEIGHTS.lateArrival +
    input.absentDays * SCORE_WEIGHTS.absent;

  return Math.max(0, Math.round(raw));
}

export async function getScoreboard(filters: { from: string; to: string }): Promise<ScoreboardEntry[]> {
  const [grid, taskResult, photoResult] = await Promise.all([
    buildAttendanceGridForRange({ from: filters.from, to: filters.to }),
    pool.query<{
      employee_id: string;
      total_tasks: string;
      completed_tasks: string;
    }>(
      `SELECT
         t.employee_id,
         COUNT(*) AS total_tasks,
         COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_tasks
       FROM tasks t
       JOIN employees e ON e.id = t.employee_id
      WHERE e.role = 'employee'
        AND e.is_active = true
        AND e.deleted_at IS NULL
        AND COALESCE(t.start_date, t.attendance_date, t.created_at::date) BETWEEN $1 AND $2
       GROUP BY t.employee_id`,
      [filters.from, filters.to]
    ),
    pool.query<{ id: string; profile_photo_path: string | null }>(
      `SELECT id, profile_photo_path
         FROM employees
        WHERE role = 'employee'
          AND is_active = true
          AND deleted_at IS NULL`
    ),
  ]);

  const photoByEmployee = new Map(
    photoResult.rows.map((row) => [row.id, row.profile_photo_path])
  );

  const taskByEmployee = new Map(
    taskResult.rows.map((row) => [
      row.employee_id,
      {
        totalTasks: parseInt(row.total_tasks, 10),
        completedTasks: parseInt(row.completed_tasks, 10),
      },
    ])
  );

  const entries: ScoreboardEntry[] = grid.employees.map((row) => {
    const summary = row.summary;
    const tasks = taskByEmployee.get(row.employeeId) ?? { totalTasks: 0, completedTasks: 0 };
    const daysPresent =
      summary.present + summary.holidayWorked + summary.weeklyOffWorked;

    return {
      employee_id: row.employeeId,
      employee_code: row.employeeCode,
      name: row.name,
      designation: row.designation ?? null,
      profile_photo_path: photoByEmployee.get(row.employeeId) ?? null,
      total_days_present: daysPresent,
      half_days: summary.halfDay,
      absent_days: summary.absent,
      late_arrivals: summary.lateCheckIns,
      leave_days: summary.leave,
      total_tasks: tasks.totalTasks,
      completed_tasks: tasks.completedTasks,
      score: calculateScore({
        daysPresent,
        halfDays: summary.halfDay,
        absentDays: summary.absent,
        lateArrivals: summary.lateCheckIns,
        leaveDays: summary.leave,
        completedTasks: tasks.completedTasks,
      }),
    };
  });

  return entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function scoreLegendText(): string {
  return [
    `+${SCORE_WEIGHTS.present} full-day present`,
    `+${SCORE_WEIGHTS.halfDay} half day`,
    `+${SCORE_WEIGHTS.leave} approved leave`,
    `+${SCORE_WEIGHTS.taskCompleted} completed task`,
    `${SCORE_WEIGHTS.lateArrival} late arrival`,
    `${SCORE_WEIGHTS.absent} absent day`,
  ].join(" · ");
}
