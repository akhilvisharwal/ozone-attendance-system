import { pool } from "../config/db";
import * as notificationsRepo from "../modules/notifications/notifications.repository";
import * as tasksRepo from "../modules/tasks/tasks.repository";

const REMINDER_INTERVAL_MS = 60 * 60 * 1000;

export async function runTaskReminders(): Promise<void> {
  for (const reminderType of ["due_soon", "due_today"] as const) {
    const tasks = await tasksRepo.listTasksDueForReminder(reminderType);
    for (const task of tasks) {
      const title =
        reminderType === "due_soon" ? "Task due tomorrow" : "Task due today";
      await notificationsRepo.createNotification({
        employeeId: task.employee_id,
        type: reminderType === "due_soon" ? "task_due_soon" : "task_due_today",
        title,
        body: task.title,
        linkPath: "/tasks",
        entityId: task.id,
      });
      await tasksRepo.logReminder(task.id, reminderType);
    }
  }
}

export function startTaskReminderScheduler(): void {
  const tick = async () => {
    try {
      await pool.query("SELECT 1");
      await runTaskReminders();
    } catch (err) {
      console.error("[task-reminders] failed:", err);
    }
  };

  tick();
  setInterval(tick, REMINDER_INTERVAL_MS);
}
