import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isCategoryEnabled,
  mapNotificationTypeToCategory,
} from "./push.repository";

describe("push notification categories", () => {
  it("maps event types to preference categories", () => {
    assert.equal(mapNotificationTypeToCategory("attendance_reminder"), "attendance");
    assert.equal(mapNotificationTypeToCategory("task_assigned"), "task");
    assert.equal(mapNotificationTypeToCategory("leave_reviewed"), "leave");
    assert.equal(mapNotificationTypeToCategory("expense_approved"), "expense");
    assert.equal(mapNotificationTypeToCategory("otp_verification"), "security");
    assert.equal(mapNotificationTypeToCategory("security_database_reset"), "security");
  });

  it("never disables security alerts", () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      updatedAt: null,
      attendanceReminders: false,
      taskNotifications: false,
      leaveNotifications: false,
      expenseNotifications: false,
    };
    assert.equal(isCategoryEnabled(prefs, "security"), true);
    assert.equal(isCategoryEnabled(prefs, "attendance"), false);
    assert.equal(isCategoryEnabled(prefs, "task"), false);
  });
});
