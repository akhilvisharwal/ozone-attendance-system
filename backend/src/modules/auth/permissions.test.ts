import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultJuniorAdminPermissions,
  emptyPermissions,
  fullPermissions,
  hasAllPermissions,
  hasPermission,
  normalizePermissions,
} from "./permissions";

describe("admin permissions helpers", () => {
  it("normalizes unknown keys and coerces booleans", () => {
    const normalized = normalizePermissions({
      viewDashboard: 1,
      viewAttendance: "yes",
      unknown: true,
    });
    assert.equal(normalized.viewDashboard, true);
    assert.equal(normalized.viewAttendance, true);
    assert.equal(normalized.editAttendance, false);
    assert.equal("unknown" in normalized, false);
  });

  it("treats master-style full permissions as all enabled", () => {
    const all = fullPermissions();
    assert.equal(hasAllPermissions(all, ["viewDashboard", "deleteTasks", "viewReports"]), true);
  });

  it("checks individual and combined permissions", () => {
    const perms = defaultJuniorAdminPermissions();
    assert.equal(hasPermission(perms, "viewAttendance"), true);
    assert.equal(hasPermission(perms, "editAttendance"), true);
    assert.equal(hasPermission(perms, "manualAttendance"), true);
    assert.equal(hasPermission(perms, "deleteTasks"), false);
    assert.equal(hasAllPermissions(perms, ["viewAttendance", "sendAttendanceReminders"]), true);
    assert.equal(hasAllPermissions(perms, ["viewAttendance", "assignTasks"]), false);
  });

  it("starts empty permissions as all false", () => {
    const empty = emptyPermissions();
    assert.equal(Object.values(empty).every((v) => v === false), true);
  });
});
