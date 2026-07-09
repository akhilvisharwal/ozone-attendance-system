import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseIdFormat } from "../../utils/employeeCode";
import { normalizeEmployeeSettings, resolveEmployeeRoleFromSettings } from "../../utils/settingsHelpers";

describe("employee settings helpers", () => {
  it("parses and normalizes employee ID format", () => {
    assert.deepEqual(parseIdFormat("OZN###"), { prefix: "OZN", padLength: 3 });
    assert.deepEqual(parseIdFormat("EMP###"), { prefix: "EMP", padLength: 3 });

    const normalized = normalizeEmployeeSettings({
      defaultDesignationId: null,
      idFormat: "ozn##",
      defaultPassword: "Pass123",
      requirePasswordChange: true,
      profilePhotoRequired: false,
      activeByDefault: true,
    });
    assert.equal(normalized.idFormat, "OZN##");
    assert.equal(normalized.defaultDesignationId, null);
  });

  it("keeps a valid defaultDesignationId and drops invalid values", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const withId = normalizeEmployeeSettings({
      defaultDesignationId: id,
      defaultRole: "manager",
      idFormat: "EMP###",
      defaultPassword: "Pass123",
      requirePasswordChange: true,
      profilePhotoRequired: false,
      activeByDefault: true,
    });
    assert.equal(withId.defaultDesignationId, id);
    assert.equal(withId.defaultRole, undefined);

    const invalid = normalizeEmployeeSettings({
      defaultDesignationId: "not-a-uuid",
      idFormat: "EMP###",
      defaultPassword: "Pass123",
      requirePasswordChange: true,
      profilePhotoRequired: false,
      activeByDefault: true,
    });
    assert.equal(invalid.defaultDesignationId, null);
  });

  it("always creates employee DB role from settings defaults", () => {
    assert.equal(resolveEmployeeRoleFromSettings("manager"), "employee");
    assert.equal(resolveEmployeeRoleFromSettings("employee"), "employee");
    assert.equal(resolveEmployeeRoleFromSettings("admin"), "employee");
    assert.equal(resolveEmployeeRoleFromSettings(), "employee");
  });
});
