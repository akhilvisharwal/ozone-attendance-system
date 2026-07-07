import { pool } from "../../config/db";
import { ScoreboardEntry } from "../../types";

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
  const result = await pool.query<ScoreboardEntry>(
    `WITH
      attendance_stats AS (
        SELECT
          a.employee_id,
          COUNT(*) FILTER (WHERE a.day_status = 'present') AS days_present,
          COUNT(*) FILTER (WHERE a.day_status = 'half_day') AS days_half,
          COUNT(*) FILTER (WHERE a.day_status = 'absent' OR a.status = 'absent') AS days_absent,
          COUNT(*) FILTER (WHERE a.check_in_status = 'late') AS late_arrivals
        FROM attendance a
        WHERE a.attendance_date BETWEEN $1 AND $2
        GROUP BY a.employee_id
      ),
      leave_stats AS (
        SELECT
          lr.employee_id,
          COUNT(*) FILTER (WHERE lr.status = 'approved') AS leave_days
        FROM leave_requests lr
        WHERE lr.leave_date BETWEEN $1 AND $2
        GROUP BY lr.employee_id
      ),
      task_stats AS (
        SELECT
          t.employee_id,
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_tasks
        FROM tasks t
        WHERE COALESCE(t.start_date, t.attendance_date, t.created_at::date) BETWEEN $1 AND $2
        GROUP BY t.employee_id
      )
    SELECT
      e.id                                                        AS employee_id,
      e.employee_code,
      e.name,
      e.profile_photo_path,
      COALESCE(ast.days_present, 0)::int                          AS total_days_present,
      COALESCE(ast.days_half, 0)::int                             AS half_days,
      COALESCE(ast.days_absent, 0)::int                           AS absent_days,
      COALESCE(ast.late_arrivals, 0)::int                         AS late_arrivals,
      COALESCE(ls.leave_days, 0)::int                             AS leave_days,
      COALESCE(ts.total_tasks, 0)::int                            AS total_tasks,
      COALESCE(ts.completed_tasks, 0)::int                        AS completed_tasks,
      GREATEST(0, (
        COALESCE(ast.days_present, 0) * ${SCORE_WEIGHTS.present}
        + COALESCE(ast.days_half, 0) * ${SCORE_WEIGHTS.halfDay}
        + COALESCE(ls.leave_days, 0) * ${SCORE_WEIGHTS.leave}
        + COALESCE(ts.completed_tasks, 0) * ${SCORE_WEIGHTS.taskCompleted}
        + COALESCE(ast.late_arrivals, 0) * ${SCORE_WEIGHTS.lateArrival}
        + COALESCE(ast.days_absent, 0) * ${SCORE_WEIGHTS.absent}
      ))::int                                                      AS score
    FROM employees e
    LEFT JOIN attendance_stats ast ON ast.employee_id = e.id
    LEFT JOIN leave_stats ls ON ls.employee_id = e.id
    LEFT JOIN task_stats ts ON ts.employee_id = e.id
    WHERE e.role = 'employee' AND e.is_active = true AND e.deleted_at IS NULL
    ORDER BY score DESC, e.name ASC`,
    [filters.from, filters.to]
  );
  return result.rows;
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
