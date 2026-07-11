import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmployeeName, employeeCreatedAtOrderBy, attendanceDateOrderBy } from "./chronologicalSort";

describe("normalizeEmployeeName", () => {
  it("trims and collapses whitespace", () => {
    assert.equal(normalizeEmployeeName("  Jane   Doe  "), "Jane Doe");
  });
});

describe("order helpers", () => {
  it("defaults employee order to oldest first", () => {
    assert.match(employeeCreatedAtOrderBy(), /ASC/);
    assert.match(employeeCreatedAtOrderBy("newest"), /DESC/);
  });

  it("defaults attendance order to oldest first", () => {
    assert.match(attendanceDateOrderBy(), /ASC/);
    assert.match(attendanceDateOrderBy("newest"), /DESC/);
  });
});
