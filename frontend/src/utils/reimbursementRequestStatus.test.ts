import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canClearCompletedReimbursementRequest } from "./reimbursementRequestStatus";

describe("clear/archive completed reimbursement request", () => {
  it("shows the action when every item is approved or paid", () => {
    assert.equal(
      canClearCompletedReimbursementRequest("approved", ["approved", "approved"]),
      true
    );
    assert.equal(canClearCompletedReimbursementRequest("paid", ["paid"]), true);
    assert.equal(
      canClearCompletedReimbursementRequest("approved", ["approved", "paid"]),
      true
    );
  });

  it("uses the server flag when line items are not loaded", () => {
    assert.equal(canClearCompletedReimbursementRequest("approved", [], true), true);
    assert.equal(canClearCompletedReimbursementRequest("paid", [], true), true);
    assert.equal(canClearCompletedReimbursementRequest("approved", [], false), false);
  });

  it("hides the action for pending, rejected, mixed, or already archived requests", () => {
    assert.equal(
      canClearCompletedReimbursementRequest("pending_approval", ["approved", "pending"]),
      false
    );
    assert.equal(
      canClearCompletedReimbursementRequest("approved", ["approved", "rejected"]),
      false
    );
    assert.equal(canClearCompletedReimbursementRequest("rejected", ["rejected"]), false);
    assert.equal(canClearCompletedReimbursementRequest("archived", ["archived"]), false);
  });
});
