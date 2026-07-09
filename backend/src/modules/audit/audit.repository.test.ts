import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAuditDescription, resolveAuditMeta } from "./audit.catalog";

describe("audit enrichment helpers", () => {
  it("maps leave approval actions", () => {
    const meta = resolveAuditMeta("leave.approved", "leave_requests");
    assert.equal(meta.module, "Leave");
    assert.equal(meta.actionType, "Leave Approval");
  });

  it("includes reason in description for manual attendance", () => {
    const desc = buildAuditDescription(
      "attendance.manual_save",
      { reason: "Doctor appointment", employeeCode: "OZN001" },
      "attendance"
    );
    assert.match(desc, /Manual attendance/);
    assert.match(desc, /Doctor appointment/);
    assert.match(desc, /OZN001/);
  });
});
