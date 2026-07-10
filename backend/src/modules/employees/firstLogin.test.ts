import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requiresFirstLoginPasswordChange } from "./firstLogin";

describe("first login helpers", () => {
  it("requires change only when first login is not completed", () => {
    assert.equal(requiresFirstLoginPasswordChange({ first_login_completed: false }), true);
    assert.equal(requiresFirstLoginPasswordChange({ first_login_completed: true }), false);
  });
});
