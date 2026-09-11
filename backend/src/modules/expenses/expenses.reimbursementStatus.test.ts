import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canArchiveCompletedRequest,
  countExpenseStatuses,
  deriveReimbursementRequestStatus,
} from "./expenses.reimbursementStatus";

describe("reimbursement request status from expenses", () => {
  it("stays pending while any expense is still pending", () => {
    const counts = countExpenseStatuses(["approved", "pending", "approved"]);
    assert.equal(counts.pendingCount, 1);
    assert.equal(counts.approvedCount, 2);
    assert.equal(
      deriveReimbursementRequestStatus("pending_approval", counts),
      "pending_approval"
    );
  });

  it("moves to approved when every expense is approved", () => {
    const counts = countExpenseStatuses(["approved", "approved"]);
    assert.equal(counts.pendingCount, 0);
    assert.equal(
      deriveReimbursementRequestStatus("pending_approval", counts),
      "approved"
    );
  });

  it("moves to approved when approved and rejected lines remain but none are pending", () => {
    const counts = countExpenseStatuses(["approved", "rejected"]);
    assert.equal(
      deriveReimbursementRequestStatus("pending_approval", counts),
      "approved"
    );
  });

  it("moves to rejected only when every reviewed line is rejected", () => {
    const counts = countExpenseStatuses(["rejected", "rejected"]);
    assert.equal(
      deriveReimbursementRequestStatus("pending_approval", counts),
      "rejected"
    );
  });

  it("does not move a paid or archived request backwards", () => {
    const counts = countExpenseStatuses(["paid", "paid"]);
    assert.equal(deriveReimbursementRequestStatus("paid", counts), "paid");
    assert.equal(deriveReimbursementRequestStatus("archived", counts), "archived");
  });

  it("promotes a stale pending parent when every line is already paid", () => {
    const counts = countExpenseStatuses(["paid", "paid"]);
    assert.equal(
      deriveReimbursementRequestStatus("pending_approval", counts),
      "approved"
    );
  });
});

describe("clear/archive completed reimbursement requests", () => {
  it("allows archive when every item is approved", () => {
    assert.equal(canArchiveCompletedRequest("approved", ["approved", "approved"]), true);
  });

  it("allows archive when every item is paid", () => {
    assert.equal(canArchiveCompletedRequest("paid", ["paid", "paid"]), true);
  });

  it("allows archive for a mix of approved and paid items", () => {
    assert.equal(canArchiveCompletedRequest("approved", ["approved", "paid"]), true);
  });

  it("blocks archive while any item is still pending", () => {
    assert.equal(canArchiveCompletedRequest("pending_approval", ["approved", "pending"]), false);
    assert.equal(canArchiveCompletedRequest("approved", ["approved", "pending"]), false);
  });

  it("blocks archive when any item was rejected", () => {
    assert.equal(canArchiveCompletedRequest("approved", ["approved", "rejected"]), false);
    assert.equal(canArchiveCompletedRequest("paid", ["paid", "rejected"]), false);
  });

  it("blocks archive for already archived requests", () => {
    assert.equal(canArchiveCompletedRequest("archived", ["archived", "archived"]), false);
  });
});
