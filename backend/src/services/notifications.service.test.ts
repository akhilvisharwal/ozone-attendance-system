import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveNotificationGates } from "./notifications.service";

describe("notification settings gating", () => {
  it("requires email master switch for specific notification types", () => {
    const disabledEmail = resolveNotificationGates({
      emailEnabled: false,
      leaveApproval: true,
      attendanceReminder: true,
      holidayNotifications: true,
    });
    assert.equal(disabledEmail.email, false);
    assert.equal(disabledEmail.leaveApproval, false);
    assert.equal(disabledEmail.attendanceReminder, false);
    assert.equal(disabledEmail.holiday, false);

    const mixed = resolveNotificationGates({
      emailEnabled: true,
      leaveApproval: true,
      attendanceReminder: false,
      holidayNotifications: true,
    });
    assert.equal(mixed.leaveApproval, true);
    assert.equal(mixed.attendanceReminder, false);
    assert.equal(mixed.holiday, true);
  });
});
