import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  blankCurrentPassword,
  clearPasswordFieldsAfterSuccess,
  emptyPasswordForm,
  validatePasswordForm,
} from "./securityPasswordForm";

describe("securityPasswordForm", () => {
  it("starts with an empty current password", () => {
    assert.equal(emptyPasswordForm().currentPassword, "");
  });

  it("never retains a current password from external data", () => {
    const polluted = {
      currentPassword: "ChangeMe@123",
      newPassword: "Secret1!",
      confirmPassword: "Secret1!",
    };
    assert.equal(blankCurrentPassword(polluted).currentPassword, "");
    assert.equal(blankCurrentPassword(polluted).newPassword, "Secret1!");
  });

  it("clears new-password fields and blanks current after success", () => {
    const cleared = clearPasswordFieldsAfterSuccess();
    assert.equal(cleared.currentPassword, "");
    assert.equal(cleared.newPassword, "");
    assert.equal(cleared.confirmPassword, "");
  });

  it("requires a manually entered current password", () => {
    const errors = validatePasswordForm(emptyPasswordForm());
    assert.equal(errors.currentPassword, "Current password is required.");
  });

  it("validates matching new passwords", () => {
    const errors = validatePasswordForm({
      currentPassword: "OldPass1!",
      newPassword: "NewPass2!",
      confirmPassword: "Mismatch!",
    });
    assert.equal(errors.confirmPassword, "New password and confirmation do not match.");
  });
});
