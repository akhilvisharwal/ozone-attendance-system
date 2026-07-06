import { pool } from "../../config/db";
import { ScoreboardEntry } from "../../types";

/**
 * Scoring formula (configurable constants here):
 *   - +5 points per day present
 *   - +3 points per day with ≥ 8 working hours (480 minutes)
 *   - +2 points per completed task
 *   - -1 point per absent day (day not attended but within the period)
 *
 * Score floored at 0.
 */
const PTS_PRESENT = 5;
const PTS_FULL_DAY = 3;   // ≥ 8 hours
const PTS_TASK = 2;
const PTS_ABSENT = 1;     // deducted

export async function getScoreboard(filters: { from: string; to: string }): Promise<ScoreboardEntry[]> {
  const result = await pool.query<ScoreboardEntry>(
    `WITH
      working_days AS (
        -- count calendar weekdays in range as a baseline for absent calc
        SELECT COUNT(*) AS total_weekdays
        FROM generate_series($1::date, $2::date, '1 day'::interval) d
        WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
      ),
      attendance_stats AS (
        SELECT
          a.employee_id,
          -- attended days = present or half-day (absent days are excluded)
          COUNT(*) FILTER (WHERE a.day_status IN ('present', 'half_day')) AS days_present,
          COUNT(*) FILTER (WHERE a.day_status = 'present')               AS days_full,
          COUNT(*) FILTER (WHERE a.day_status = 'half_day')             AS days_short
        FROM attendance a
        WHERE a.attendance_date BETWEEN $1 AND $2
        GROUP BY a.employee_id
      ),
      task_stats AS (
        SELECT
          t.employee_id,
          COUNT(*)                                          AS total_tasks,
          COUNT(*) FILTER (WHERE t.status = 'completed')  AS completed_tasks
        FROM tasks t
        WHERE (t.attendance_date BETWEEN $1 AND $2 OR t.attendance_date IS NULL)
          AND t.status != 'cancelled'
        GROUP BY t.employee_id
      )
    SELECT
      e.id                                                        AS employee_id,
      e.employee_code,
      e.name,
      e.profile_photo_path,
      COALESCE(ast.days_present, 0)::int                          AS total_days_present,
      COALESCE(ast.days_full, 0)::int                             AS total_days_8h,
      COALESCE(ts.total_tasks, 0)::int                            AS total_tasks,
      COALESCE(ts.completed_tasks, 0)::int                        AS completed_tasks,
      GREATEST(0,
        COALESCE(ast.days_present,0) * ${PTS_PRESENT}
        + COALESCE(ast.days_full,0) * ${PTS_FULL_DAY}
        + COALESCE(ts.completed_tasks,0) * ${PTS_TASK}
        - (
            (SELECT total_weekdays::int FROM working_days)
            - COALESCE(ast.days_present,0)
          ) * ${PTS_ABSENT}
      )::int                                                       AS score
    FROM employees e
    LEFT JOIN attendance_stats ast ON ast.employee_id = e.id
    LEFT JOIN task_stats ts ON ts.employee_id = e.id
    WHERE e.role = 'employee' AND e.is_active = true
    ORDER BY score DESC, e.name ASC`,
    [filters.from, filters.to]
  );
  return result.rows;
}

export async function getMyScore(employeeId: string, filters: { from: string; to: string }): Promise<ScoreboardEntry | null> {
  const all = await getScoreboard(filters);
  return all.find((e) => e.employee_id === employeeId) ?? null;
}
