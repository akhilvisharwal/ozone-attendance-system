import { pool } from "../../config/db";
import type { TaskStatus } from "../../types";

export interface TaskRow {
  id: string;
  employee_id: string;
  assigned_by: string | null;
  attendance_date: string | null;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: TaskStatus;
  completed_at: string | null;
  site_id: string | null;
  start_date: string | null;
  due_date: string | null;
  extended_due_date: string | null;
  expected_duration_days: number;
  progress_remarks: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  employee_code?: string;
  assigned_by_name?: string | null;
  site_name?: string | null;
  effective_due_date?: string | null;
  is_overdue?: boolean;
  assignee_count?: number;
  completed_count?: number;
  completion_percentage?: number;
}

export interface TaskAttachment {
  id: string;
  task_group_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  uploaded_by_name?: string | null;
}

export interface TaskComment {
  id: string;
  task_group_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name?: string;
}

export interface TaskExtensionRequest {
  id: string;
  task_id: string;
  requested_due_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_remarks: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  task_title?: string;
}

export interface TaskAnalytics {
  total: number;
  not_started: number;
  in_progress: number;
  on_hold: number;
  completed: number;
  overdue: number;
  completion_percentage: number;
}

const TASK_SELECT = `
  t.*,
  e.name AS employee_name,
  e.employee_code,
  a.name AS assigned_by_name,
  s.name AS site_name,
  COALESCE(t.extended_due_date, t.due_date) AS effective_due_date,
  (
    t.status NOT IN ('completed')
    AND COALESCE(t.extended_due_date, t.due_date) < CURRENT_DATE
  ) AS is_overdue
`;

export type TaskSortOrder = "newest" | "oldest";

function taskListOrderBy(sort: TaskSortOrder): string {
  if (sort === "oldest") {
    return "ORDER BY t.created_at ASC, t.updated_at ASC";
  }
  return "ORDER BY t.updated_at DESC, t.created_at DESC";
}

export async function touchTaskActivity(taskId: string): Promise<void> {
  await pool.query("UPDATE tasks SET updated_at = now() WHERE id = $1", [taskId]);
}

function mapTaskRow(row: TaskRow): TaskRow {
  return {
    ...row,
    is_overdue: Boolean(row.is_overdue),
  };
}

export async function assignTaskGroup(input: {
  employeeIds: string[];
  assignedBy: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  siteId: string | null;
  startDate: string;
  dueDate: string;
  expectedDurationDays: number;
}): Promise<{ groupId: string; tasks: TaskRow[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const groupResult = await client.query<{ id: string }>("SELECT gen_random_uuid() AS id");
    const groupId = groupResult.rows[0].id;
    const tasks: TaskRow[] = [];

    for (const employeeId of input.employeeIds) {
      const result = await client.query<TaskRow>(
        `INSERT INTO tasks (
           employee_id, assigned_by, attendance_date, title, description, priority,
           site_id, start_date, due_date, expected_duration_days, group_id, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'not_started')
         RETURNING *`,
        [
          employeeId,
          input.assignedBy,
          input.startDate,
          input.title,
          input.description,
          input.priority,
          input.siteId,
          input.startDate,
          input.dueDate,
          input.expectedDurationDays,
          groupId,
        ]
      );
      tasks.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return { groupId, tasks };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createSelfTask(input: {
  employeeId: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  startDate: string;
  dueDate: string;
  expectedDurationDays: number;
}): Promise<TaskRow> {
  const result = await pool.query<TaskRow>(
    `INSERT INTO tasks (
       employee_id, assigned_by, attendance_date, title, description, priority,
       start_date, due_date, expected_duration_days, group_id, status
     ) VALUES ($1,$1,$2,$3,$4,$5,$2,$6,$7, gen_random_uuid(), 'not_started')
     RETURNING *`,
    [
      input.employeeId,
      input.startDate,
      input.title,
      input.description,
      input.priority,
      input.dueDate,
      input.expectedDurationDays,
    ]
  );
  const task = result.rows[0];
  await pool.query("UPDATE tasks SET group_id = id WHERE id = $1 AND group_id IS NULL", [task.id]);
  const updated = await pool.query<TaskRow>("SELECT * FROM tasks WHERE id = $1", [task.id]);
  return updated.rows[0];
}

export async function updateMyTask(
  id: string,
  employeeId: string,
  input: { status?: TaskStatus; progressRemarks?: string | null }
): Promise<TaskRow | null> {
  const completedAt = input.status === "completed" ? new Date() : input.status ? null : undefined;
  const result = await pool.query<TaskRow>(
    `UPDATE tasks SET
       status = COALESCE($1, status),
       progress_remarks = COALESCE($2, progress_remarks),
       completed_at = CASE
         WHEN $1 = 'completed' THEN now()
         WHEN $1 IS NOT NULL AND $1 <> 'completed' THEN NULL
         ELSE completed_at
       END,
       updated_at = now()
     WHERE id = $3 AND employee_id = $4
     RETURNING *`,
    [input.status ?? null, input.progressRemarks ?? null, id, employeeId]
  );
  void completedAt;
  return result.rows[0] ?? null;
}

export async function deleteSelfTask(id: string, employeeId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM tasks WHERE id = $1 AND employee_id = $2 AND assigned_by = employee_id",
    [id, employeeId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listMyTasks(
  employeeId: string,
  filters: { status?: TaskStatus; overdue?: boolean; sort?: TaskSortOrder }
): Promise<TaskRow[]> {
  const conditions = ["t.employee_id = $1"];
  const values: unknown[] = [employeeId];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`t.status = $${values.length}`);
  }
  if (filters.overdue) {
    conditions.push(`t.status <> 'completed' AND COALESCE(t.extended_due_date, t.due_date) < CURRENT_DATE`);
  }

  const result = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT}
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     WHERE ${conditions.join(" AND ")}
     ${taskListOrderBy(filters.sort ?? "newest")}`,
    values
  );
  return result.rows.map(mapTaskRow);
}

export async function adminListTasks(filters: {
  employeeId?: string;
  status?: TaskStatus;
  overdue?: boolean;
  groupId?: string;
  sort?: TaskSortOrder;
}): Promise<TaskRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`t.employee_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`t.status = $${values.length}`);
  }
  if (filters.overdue) {
    conditions.push(`t.status <> 'completed' AND COALESCE(t.extended_due_date, t.due_date) < CURRENT_DATE`);
  }
  if (filters.groupId) {
    values.push(filters.groupId);
    conditions.push(`t.group_id = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT},
            (SELECT COUNT(*)::int FROM tasks g WHERE g.group_id = t.group_id) AS assignee_count,
            (SELECT COUNT(*)::int FROM tasks g WHERE g.group_id = t.group_id AND g.status = 'completed') AS completed_count
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     ${whereClause}
     ${taskListOrderBy(filters.sort ?? "newest")}`,
    values
  );
  return result.rows.map((row) => ({
    ...mapTaskRow(row),
    completion_percentage:
      row.assignee_count && row.assignee_count > 0
        ? Math.round(((row.completed_count ?? 0) / row.assignee_count) * 100)
        : row.status === "completed"
          ? 100
          : 0,
  }));
}

export async function findTaskById(id: string): Promise<TaskRow | null> {
  const result = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT}
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     WHERE t.id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? mapTaskRow(row) : null;
}

export async function findTaskForEmployee(id: string, employeeId: string): Promise<TaskRow | null> {
  const result = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT}
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     WHERE t.id = $1 AND t.employee_id = $2`,
    [id, employeeId]
  );
  const row = result.rows[0];
  return row ? mapTaskRow(row) : null;
}

export async function listGroupAssignees(groupId: string): Promise<TaskRow[]> {
  return adminListTasks({ groupId });
}

export async function getTaskAnalytics(filters?: { employeeId?: string }): Promise<TaskAnalytics> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters?.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`employee_id = $${values.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  if (!filters?.employeeId) {
    const result = await pool.query<{
      total: string;
      not_started: string;
      in_progress: string;
      on_hold: string;
      completed: string;
      overdue: string;
    }>(
      `WITH group_stats AS (
         SELECT
           group_id,
           COUNT(*)::int AS assignee_count,
           COUNT(*) FILTER (WHERE status = 'not_started')::int AS not_started,
           COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
           COUNT(*) FILTER (WHERE status = 'on_hold')::int AS on_hold,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           BOOL_OR(
             status <> 'completed'
             AND COALESCE(extended_due_date, due_date) < CURRENT_DATE
           ) AS has_overdue
         FROM tasks
         GROUP BY group_id
       )
       SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE not_started = assignee_count)::text AS not_started,
         COUNT(*) FILTER (WHERE in_progress > 0 AND completed < assignee_count)::text AS in_progress,
         COUNT(*) FILTER (WHERE on_hold > 0 AND completed < assignee_count)::text AS on_hold,
         COUNT(*) FILTER (WHERE completed = assignee_count)::text AS completed,
         COUNT(*) FILTER (WHERE has_overdue)::text AS overdue
       FROM group_stats`,
      values
    );
    const row = result.rows[0];
    const total = parseInt(row?.total ?? "0", 10);
    const completed = parseInt(row?.completed ?? "0", 10);
    return {
      total,
      not_started: parseInt(row?.not_started ?? "0", 10),
      in_progress: parseInt(row?.in_progress ?? "0", 10),
      on_hold: parseInt(row?.on_hold ?? "0", 10),
      completed,
      overdue: parseInt(row?.overdue ?? "0", 10),
      completion_percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  const result = await pool.query<{
    total: string;
    not_started: string;
    in_progress: string;
    on_hold: string;
    completed: string;
    overdue: string;
  }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status = 'not_started')::text AS not_started,
       COUNT(*) FILTER (WHERE status = 'in_progress')::text AS in_progress,
       COUNT(*) FILTER (WHERE status = 'on_hold')::text AS on_hold,
       COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
       COUNT(*) FILTER (
         WHERE status <> 'completed'
           AND COALESCE(extended_due_date, due_date) < CURRENT_DATE
       )::text AS overdue
     FROM tasks ${whereClause}`,
    values
  );

  const row = result.rows[0];
  const total = parseInt(row?.total ?? "0", 10);
  const completed = parseInt(row?.completed ?? "0", 10);

  return {
    total,
    not_started: parseInt(row?.not_started ?? "0", 10),
    in_progress: parseInt(row?.in_progress ?? "0", 10),
    on_hold: parseInt(row?.on_hold ?? "0", 10),
    completed,
    overdue: parseInt(row?.overdue ?? "0", 10),
    completion_percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export async function listCalendarTasks(filters: {
  employeeId?: string;
  from: string;
  to: string;
}): Promise<TaskRow[]> {
  const conditions = [
    `COALESCE(t.start_date, t.attendance_date) <= $2`,
    `COALESCE(t.extended_due_date, t.due_date, t.start_date, t.attendance_date) >= $1`,
  ];
  const values: unknown[] = [filters.from, filters.to];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(`t.employee_id = $${values.length}`);
  }

  const result = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT}
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE(t.start_date, t.attendance_date), t.title`,
    values
  );
  return result.rows.map(mapTaskRow);
}

export async function addAttachment(input: {
  taskGroupId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
}): Promise<TaskAttachment> {
  const result = await pool.query<TaskAttachment>(
    `INSERT INTO task_attachments (task_group_id, file_path, file_name, mime_type, file_size, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.taskGroupId, input.filePath, input.fileName, input.mimeType, input.fileSize, input.uploadedBy]
  );
  return result.rows[0];
}

export async function listAttachments(taskGroupId: string): Promise<TaskAttachment[]> {
  const result = await pool.query<TaskAttachment>(
    `SELECT ta.*, e.name AS uploaded_by_name
     FROM task_attachments ta
     LEFT JOIN employees e ON e.id = ta.uploaded_by
     WHERE ta.task_group_id = $1
     ORDER BY ta.created_at DESC`,
    [taskGroupId]
  );
  return result.rows;
}

export async function findAttachment(id: string): Promise<TaskAttachment | null> {
  const result = await pool.query<TaskAttachment>("SELECT * FROM task_attachments WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function canAccessTaskGroup(taskGroupId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const result = await pool.query(
    "SELECT 1 FROM tasks WHERE group_id = $1 AND employee_id = $2 LIMIT 1",
    [taskGroupId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function addComment(input: {
  taskGroupId: string;
  authorId: string;
  body: string;
}): Promise<TaskComment> {
  const result = await pool.query<TaskComment>(
    `INSERT INTO task_comments (task_group_id, author_id, body)
     VALUES ($1,$2,$3) RETURNING *`,
    [input.taskGroupId, input.authorId, input.body]
  );
  return result.rows[0];
}

export async function listComments(taskGroupId: string): Promise<TaskComment[]> {
  const result = await pool.query<TaskComment>(
    `SELECT tc.*, e.name AS author_name
     FROM task_comments tc
     JOIN employees e ON e.id = tc.author_id
     WHERE tc.task_group_id = $1
     ORDER BY tc.created_at ASC`,
    [taskGroupId]
  );
  return result.rows;
}

export async function createExtensionRequest(input: {
  taskId: string;
  requestedDueDate: string;
  reason: string;
}): Promise<TaskExtensionRequest> {
  const result = await pool.query<TaskExtensionRequest>(
    `INSERT INTO task_extension_requests (task_id, requested_due_date, reason)
     VALUES ($1,$2,$3) RETURNING *`,
    [input.taskId, input.requestedDueDate, input.reason]
  );
  await touchTaskActivity(input.taskId);
  return result.rows[0];
}

export async function listExtensionRequests(filters?: { status?: "pending" | "approved" | "rejected" }): Promise<TaskExtensionRequest[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters?.status) {
    values.push(filters.status);
    conditions.push(`ter.status = $${values.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query<TaskExtensionRequest>(
    `SELECT ter.*, e.name AS employee_name, t.title AS task_title
     FROM task_extension_requests ter
     JOIN tasks t ON t.id = ter.task_id
     JOIN employees e ON e.id = t.employee_id
     ${whereClause}
     ORDER BY ter.created_at DESC`,
    values
  );
  return result.rows;
}

export async function listMyExtensionRequests(taskId: string, employeeId: string): Promise<TaskExtensionRequest[]> {
  const result = await pool.query<TaskExtensionRequest>(
    `SELECT ter.*
     FROM task_extension_requests ter
     JOIN tasks t ON t.id = ter.task_id
     WHERE ter.task_id = $1 AND t.employee_id = $2
     ORDER BY ter.created_at DESC`,
    [taskId, employeeId]
  );
  return result.rows;
}

export async function reviewExtensionRequest(input: {
  id: string;
  reviewerId: string;
  status: "approved" | "rejected";
  adminRemarks?: string | null;
}): Promise<TaskExtensionRequest | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<TaskExtensionRequest>(
      "SELECT * FROM task_extension_requests WHERE id = $1 AND status = 'pending' FOR UPDATE",
      [input.id]
    );
    const request = existing.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return null;
    }

    const updated = await client.query<TaskExtensionRequest>(
      `UPDATE task_extension_requests
       SET status = $1, reviewed_by = $2, reviewed_at = now(), admin_remarks = $3
       WHERE id = $4 RETURNING *`,
      [input.status, input.reviewerId, input.adminRemarks ?? null, input.id]
    );

    if (input.status === "approved") {
      await client.query(
        `UPDATE tasks SET extended_due_date = $1, updated_at = now() WHERE id = $2`,
        [request.requested_due_date, request.task_id]
      );
    } else {
      await client.query(`UPDATE tasks SET updated_at = now() WHERE id = $1`, [request.task_id]);
    }

    await client.query("COMMIT");
    return updated.rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listTasksDueForReminder(reminderType: "due_soon" | "due_today"): Promise<TaskRow[]> {
  const dateCondition =
    reminderType === "due_soon"
      ? "COALESCE(t.extended_due_date, t.due_date) = CURRENT_DATE + INTERVAL '1 day'"
      : "COALESCE(t.extended_due_date, t.due_date) = CURRENT_DATE";

  const result = await pool.query<TaskRow>(
    `SELECT t.*, e.name AS employee_name
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     WHERE t.status <> 'completed'
       AND ${dateCondition}
       AND NOT EXISTS (
         SELECT 1 FROM task_reminder_log trl
         WHERE trl.task_id = t.id AND trl.reminder_type = $1
       )`,
    [reminderType]
  );
  return result.rows;
}

export async function logReminder(taskId: string, reminderType: "due_soon" | "due_today"): Promise<void> {
  await pool.query(
    `INSERT INTO task_reminder_log (task_id, reminder_type)
     VALUES ($1, $2) ON CONFLICT (task_id, reminder_type) DO NOTHING`,
    [taskId, reminderType]
  );
}

export interface TaskGroupAssignee {
  task_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  status: TaskStatus;
  progress_remarks: string | null;
  is_overdue: boolean;
}

export interface TaskGroupSummary {
  group_id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  site_id: string | null;
  site_name: string | null;
  start_date: string | null;
  due_date: string | null;
  effective_due_date: string | null;
  expected_duration_days: number;
  assigned_by_name: string | null;
  assignee_count: number;
  completed_count: number;
  completion_percentage: number;
  is_overdue: boolean;
  assignees: TaskGroupAssignee[];
  created_at: string;
  updated_at: string;
}

function parseAssignees(raw: unknown): TaskGroupAssignee[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      task_id: String(row.task_id),
      employee_id: String(row.employee_id),
      employee_name: String(row.employee_name ?? ""),
      employee_code: String(row.employee_code ?? ""),
      status: row.status as TaskStatus,
      progress_remarks: row.progress_remarks ? String(row.progress_remarks) : null,
      is_overdue: Boolean(row.is_overdue),
    };
  });
}

function mapTaskGroupRow(row: Record<string, unknown>): TaskGroupSummary {
  const assigneeCount = Number(row.assignee_count ?? 0);
  const completedCount = Number(row.completed_count ?? 0);
  return {
    group_id: String(row.group_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    priority: row.priority as TaskGroupSummary["priority"],
    site_id: row.site_id ? String(row.site_id) : null,
    site_name: row.site_name ? String(row.site_name) : null,
    start_date: row.start_date ? String(row.start_date) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    effective_due_date: row.effective_due_date ? String(row.effective_due_date) : null,
    expected_duration_days: Number(row.expected_duration_days ?? 1),
    assigned_by_name: row.assigned_by_name ? String(row.assigned_by_name) : null,
    assignee_count: assigneeCount,
    completed_count: completedCount,
    completion_percentage:
      assigneeCount > 0 ? Math.round((completedCount / assigneeCount) * 100) : 0,
    is_overdue: Boolean(row.is_overdue),
    assignees: parseAssignees(row.assignees),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function buildGroupFilterConditions(
  filters: {
    employeeId?: string;
    status?: TaskStatus;
    overdue?: boolean;
    groupId?: string;
  },
  values: unknown[]
): string[] {
  const conditions: string[] = [];
  if (filters.groupId) {
    values.push(filters.groupId);
    conditions.push(`t.group_id = $${values.length}`);
  }
  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(
      `t.group_id IN (SELECT group_id FROM tasks WHERE employee_id = $${values.length})`
    );
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(
      `t.group_id IN (SELECT group_id FROM tasks WHERE status = $${values.length})`
    );
  }
  if (filters.overdue) {
    conditions.push(
      `t.group_id IN (
         SELECT group_id FROM tasks
         WHERE status <> 'completed'
           AND COALESCE(extended_due_date, due_date) < CURRENT_DATE
       )`
    );
  }
  return conditions;
}

export async function adminListTaskGroups(filters: {
  employeeId?: string;
  status?: TaskStatus;
  overdue?: boolean;
  groupId?: string;
  sort?: TaskSortOrder;
}): Promise<TaskGroupSummary[]> {
  const values: unknown[] = [];
  const conditions = buildGroupFilterConditions(filters, values);
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy =
    filters.sort === "oldest"
      ? "ORDER BY MAX(t.created_at) ASC, MAX(t.updated_at) ASC"
      : "ORDER BY MAX(t.updated_at) DESC, MAX(t.created_at) DESC";

  const result = await pool.query(
    `SELECT
       t.group_id,
       MAX(t.title) AS title,
       MAX(t.description) AS description,
       MAX(t.priority) AS priority,
       MAX(t.site_id::text)::uuid AS site_id,
       MAX(s.name) AS site_name,
       MAX(t.start_date) AS start_date,
       MAX(t.due_date) AS due_date,
       MAX(COALESCE(t.extended_due_date, t.due_date)) AS effective_due_date,
       MAX(t.expected_duration_days) AS expected_duration_days,
       MAX(a.name) AS assigned_by_name,
       COUNT(*)::int AS assignee_count,
       COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_count,
       BOOL_OR(
         t.status <> 'completed'
         AND COALESCE(t.extended_due_date, t.due_date) < CURRENT_DATE
       ) AS is_overdue,
       MAX(t.created_at) AS created_at,
       MAX(t.updated_at) AS updated_at,
       json_agg(
         json_build_object(
           'task_id', t.id,
           'employee_id', t.employee_id,
           'employee_name', e.name,
           'employee_code', e.employee_code,
           'status', t.status,
           'progress_remarks', t.progress_remarks,
           'is_overdue', (
             t.status <> 'completed'
             AND COALESCE(t.extended_due_date, t.due_date) < CURRENT_DATE
           )
         )
         ORDER BY e.name
       ) AS assignees
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     ${whereClause}
     GROUP BY t.group_id
     ${orderBy}`,
    values
  );

  return result.rows.map((row) => mapTaskGroupRow(row as Record<string, unknown>));
}

export async function findTaskGroup(groupId: string): Promise<TaskGroupSummary | null> {
  const groups = await adminListTaskGroups({ groupId, sort: "newest" });
  return groups[0] ?? null;
}

export async function adminUpdateTaskGroup(
  groupId: string,
  input: {
    assignedBy: string;
    employeeIds: string[];
    title: string;
    description: string | null;
    priority: "low" | "medium" | "high";
    siteId: string | null;
    startDate: string;
    dueDate: string;
    expectedDurationDays: number;
  }
): Promise<{ groupId: string; addedEmployeeIds: string[]; removedEmployeeIds: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string; employee_id: string; assigned_by: string | null }>(
      "SELECT id, employee_id, assigned_by FROM tasks WHERE group_id = $1 FOR UPDATE",
      [groupId]
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return { groupId, addedEmployeeIds: [], removedEmployeeIds: [] };
    }

    const assignedBy = existing.rows[0].assigned_by ?? input.assignedBy;
    const currentMap = new Map(existing.rows.map((row) => [row.employee_id, row.id]));
    const nextIds = new Set(input.employeeIds);

    await client.query(
      `UPDATE tasks SET
         title = $1,
         description = $2,
         priority = $3,
         site_id = $4,
         start_date = $5,
         due_date = $6,
         attendance_date = $5,
         expected_duration_days = $7,
         updated_at = now()
       WHERE group_id = $8`,
      [
        input.title,
        input.description,
        input.priority,
        input.siteId,
        input.startDate,
        input.dueDate,
        input.expectedDurationDays,
        groupId,
      ]
    );

    const removedEmployeeIds: string[] = [];
    for (const [employeeId, taskId] of currentMap.entries()) {
      if (!nextIds.has(employeeId)) {
        await client.query("DELETE FROM task_extension_requests WHERE task_id = $1", [taskId]);
        await client.query(
          "DELETE FROM app_notifications WHERE entity_id = $1",
          [taskId]
        );
        await client.query("DELETE FROM tasks WHERE id = $1", [taskId]);
        removedEmployeeIds.push(employeeId);
      }
    }

    const addedEmployeeIds: string[] = [];
    for (const employeeId of input.employeeIds) {
      if (!currentMap.has(employeeId)) {
        await client.query(
          `INSERT INTO tasks (
             employee_id, assigned_by, attendance_date, title, description, priority,
             site_id, start_date, due_date, expected_duration_days, group_id, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'not_started')`,
          [
            employeeId,
            assignedBy,
            input.startDate,
            input.title,
            input.description,
            input.priority,
            input.siteId,
            input.startDate,
            input.dueDate,
            input.expectedDurationDays,
            groupId,
          ]
        );
        addedEmployeeIds.push(employeeId);
      }
    }

    await client.query("COMMIT");
    return { groupId, addedEmployeeIds, removedEmployeeIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listCalendarTaskGroups(filters: {
  employeeId?: string;
  from: string;
  to: string;
}): Promise<TaskGroupSummary[]> {
  const values: unknown[] = [filters.from, filters.to];
  const conditions = [
    `COALESCE(t.start_date, t.attendance_date) <= $2`,
    `COALESCE(t.extended_due_date, t.due_date, t.start_date, t.attendance_date) >= $1`,
  ];

  if (filters.employeeId) {
    values.push(filters.employeeId);
    conditions.push(
      `t.group_id IN (SELECT group_id FROM tasks WHERE employee_id = $${values.length})`
    );
  }

  const result = await pool.query(
    `SELECT
       t.group_id,
       MAX(t.title) AS title,
       MAX(t.description) AS description,
       MAX(t.priority) AS priority,
       MAX(t.site_id::text)::uuid AS site_id,
       MAX(s.name) AS site_name,
       MAX(t.start_date) AS start_date,
       MAX(t.due_date) AS due_date,
       MAX(COALESCE(t.extended_due_date, t.due_date)) AS effective_due_date,
       MAX(t.expected_duration_days) AS expected_duration_days,
       MAX(a.name) AS assigned_by_name,
       COUNT(*)::int AS assignee_count,
       COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_count,
       BOOL_OR(
         t.status <> 'completed'
         AND COALESCE(t.extended_due_date, t.due_date) < CURRENT_DATE
       ) AS is_overdue,
       MAX(t.created_at) AS created_at,
       MAX(t.updated_at) AS updated_at,
       json_agg(
         json_build_object(
           'task_id', t.id,
           'employee_id', t.employee_id,
           'employee_name', e.name,
           'employee_code', e.employee_code,
           'status', t.status,
           'progress_remarks', t.progress_remarks,
           'is_overdue', (
             t.status <> 'completed'
             AND COALESCE(t.extended_due_date, t.due_date) < CURRENT_DATE
           )
         )
         ORDER BY e.name
       ) AS assignees
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY t.group_id
     ORDER BY MAX(COALESCE(t.start_date, t.attendance_date)), MAX(t.title)`,
    values
  );

  return result.rows.map((row) => mapTaskGroupRow(row as Record<string, unknown>));
}

export async function adminDeleteTaskGroup(groupId: string): Promise<{
  deletedCount: number;
  groupId: string;
  title: string | null;
  attachmentPaths: string[];
}> {
  const sample = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT}
     FROM tasks t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees a ON a.id = t.assigned_by
     LEFT JOIN sites s ON s.id = t.site_id
     WHERE t.group_id = $1
     LIMIT 1`,
    [groupId]
  );
  const task = sample.rows[0];
  if (!task) {
    return { deletedCount: 0, groupId, title: null, attachmentPaths: [] };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tasksResult = await client.query<{ id: string }>(
      "SELECT id FROM tasks WHERE group_id = $1",
      [groupId]
    );
    const taskIds = tasksResult.rows.map((row) => row.id);
    const attachments = await client.query<{ file_path: string }>(
      "SELECT file_path FROM task_attachments WHERE task_group_id = $1",
      [groupId]
    );
    await client.query("DELETE FROM task_attachments WHERE task_group_id = $1", [groupId]);
    await client.query("DELETE FROM task_comments WHERE task_group_id = $1", [groupId]);
    if (taskIds.length > 0) {
      await client.query(
        `DELETE FROM app_notifications
         WHERE entity_id = ANY($1::uuid[]) OR entity_id = $2`,
        [taskIds, groupId]
      );
    }
    const deleteResult = await client.query("DELETE FROM tasks WHERE group_id = $1", [groupId]);
    await client.query("COMMIT");
    return {
      deletedCount: deleteResult.rowCount ?? 0,
      groupId,
      title: task.title,
      attachmentPaths: attachments.rows.map((row) => row.file_path),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function adminDeleteTask(id: string): Promise<{
  deletedCount: number;
  groupId: string | null;
  title: string | null;
  attachmentPaths: string[];
}> {
  const task = await findTaskById(id);
  if (!task) {
    return { deletedCount: 0, groupId: null, title: null, attachmentPaths: [] };
  }
  const result = await adminDeleteTaskGroup(task.group_id ?? task.id);
  return {
    deletedCount: result.deletedCount,
    groupId: result.groupId,
    title: result.title,
    attachmentPaths: result.attachmentPaths,
  };
}

export async function adminClearAllTasks(): Promise<{
  deletedCount: number;
  attachmentPaths: string[];
}> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const attachments = await client.query<{ file_path: string }>(
      "SELECT file_path FROM task_attachments"
    );

    await client.query(
      `DELETE FROM app_notifications
       WHERE type IN (
         'task_assigned', 'task_updated', 'task_comment',
         'extension_requested', 'extension_reviewed',
         'task_due_soon', 'task_due_today'
       )`
    );
    await client.query("DELETE FROM task_attachments");
    await client.query("DELETE FROM task_comments");
    const deleteResult = await client.query("DELETE FROM tasks");

    await client.query("COMMIT");

    return {
      deletedCount: deleteResult.rowCount ?? 0,
      attachmentPaths: attachments.rows.map((row) => row.file_path),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
