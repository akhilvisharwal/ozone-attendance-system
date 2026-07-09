import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuditDescription,
  resolveAuditMeta,
  actionsForModule,
  actionsForActionType,
} from "./audit.catalog";

describe("audit.catalog", () => {
  it("resolves known actions", () => {
    const meta = resolveAuditMeta("attendance.check_in");
    assert.equal(meta.module, "Attendance");
    assert.equal(meta.actionType, "Attendance");
    assert.equal(meta.label, "Check-in");
  });

  it("builds descriptions with metadata context", () => {
    const desc = buildAuditDescription(
      "settings.update",
      { category: "security" },
      "settings"
    );
    assert.match(desc, /Settings changed/);
    assert.match(desc, /security/);
  });

  it("lists actions for module and action type filters", () => {
    assert.ok(actionsForModule("Auth").includes("auth.login"));
    assert.ok(actionsForActionType("Login").includes("auth.login_failed"));
  });
});
