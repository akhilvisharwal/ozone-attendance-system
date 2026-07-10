import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import * as notificationsRepo from "./notifications.repository";

describe("notifications repository", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let employeeId: string;
  const createdIds: string[] = [];

  before(async () => {
    const row = await pool.query<{ id: string }>(
      `SELECT id FROM employees
        WHERE role = 'employee' AND is_active = true AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`
    );
    if (!row.rows[0]) throw new Error("Need an active employee for notification tests");
    employeeId = row.rows[0].id;
  });

  after(async () => {
    if (createdIds.length) {
      await pool.query(`DELETE FROM app_notifications WHERE id = ANY($1::uuid[])`, [createdIds]);
    }
  });

  it("creates, lists, marks read, and deletes notifications", async () => {
    const created = await notificationsRepo.createNotification({
      employeeId,
      type: "attendance_reminder",
      title: "Test reminder",
      body: "Please check in",
      linkPath: "/",
    });
    createdIds.push(created.id);

    const listed = await notificationsRepo.listMyNotifications(employeeId, 10);
    assert.ok(listed.some((item) => item.id === created.id));

    const unreadBefore = await notificationsRepo.countUnread(employeeId);
    assert.ok(unreadBefore >= 1);

    const marked = await notificationsRepo.markRead(created.id, employeeId);
    assert.equal(marked, true);
    assert.equal(await notificationsRepo.countUnread(employeeId), unreadBefore - 1);

    const deleted = await notificationsRepo.deleteNotification(created.id, employeeId);
    assert.equal(deleted, true);
    createdIds.pop();
    assert.equal(
      (await notificationsRepo.listMyNotifications(employeeId, 10)).some((item) => item.id === created.id),
      false
    );
  });

  it("markAllRead clears unread count for employee notifications", async () => {
    const first = await notificationsRepo.createNotification({
      employeeId,
      type: "attendance_reminder",
      title: "Unread 1",
    });
    const second = await notificationsRepo.createNotification({
      employeeId,
      type: "attendance_reminder",
      title: "Unread 2",
    });
    createdIds.push(first.id, second.id);

    const updated = await notificationsRepo.markAllRead(employeeId);
    assert.ok(updated >= 2);
    assert.equal(await notificationsRepo.countUnread(employeeId), 0);
  });
});
