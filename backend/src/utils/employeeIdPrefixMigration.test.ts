import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateMigratedEmployeeCode,
  buildMigratedEmployeeCode,
  extractNumericSuffix,
  prefixesDiffer,
} from "./employeeIdPrefixMigration";

describe("employee ID prefix migration helpers", () => {
  it("extracts numeric suffixes", () => {
    assert.equal(extractNumericSuffix("OZN001"), "001");
    assert.equal(extractNumericSuffix("EMP12"), "12");
    assert.equal(extractNumericSuffix("ADMIN"), null);
  });

  it("preserves numeric parts when rewriting prefixes", () => {
    assert.equal(buildMigratedEmployeeCode("OZN001", "EMP", 3, "OZN"), "EMP001");
    assert.equal(buildMigratedEmployeeCode("OZN002", "EMP", 3, "OZN"), "EMP002");
    assert.equal(buildMigratedEmployeeCode("OZN12", "EMP", 3, "OZN"), "EMP012");
    assert.equal(buildMigratedEmployeeCode("OZN1001", "EMP", 3, "OZN"), "EMP1001");
    // Prefix itself may contain digits — only the suffix after the old prefix is kept.
    assert.equal(buildMigratedEmployeeCode("PA019001", "PB019", 3, "PA019"), "PB019001");
  });

  it("allocates the next free code when the preferred ID is taken", () => {
    const used = new Set(["EMP001"]);
    const first = allocateMigratedEmployeeCode("001", "EMP", 3, used);
    assert.equal(first.code, "EMP002");
    assert.equal(first.remappedDueToConflict, true);

    const second = allocateMigratedEmployeeCode("003", "EMP", 3, used);
    assert.equal(second.code, "EMP003");
    assert.equal(second.remappedDueToConflict, false);
  });

  it("detects prefix changes in id formats", () => {
    assert.equal(prefixesDiffer("OZN###", "EMP###"), true);
    assert.equal(prefixesDiffer("OZN###", "ozn###"), false);
    assert.equal(prefixesDiffer("OZN###", "OZN####"), false);
  });
});
