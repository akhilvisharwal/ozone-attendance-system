import { describe, expect, it } from "vitest";
import { normalizeEmployeeName, employeeCreatedAtOrderBy, attendanceDateOrderBy } from "./chronologicalSort";

describe("normalizeEmployeeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeEmployeeName("  Jane   Doe  ")).toBe("Jane Doe");
  });
});

describe("order helpers", () => {
  it("defaults employee order to oldest first", () => {
    expect(employeeCreatedAtOrderBy()).toContain("ASC");
    expect(employeeCreatedAtOrderBy("newest")).toContain("DESC");
  });

  it("defaults attendance order to oldest first", () => {
    expect(attendanceDateOrderBy()).toContain("ASC");
    expect(attendanceDateOrderBy("newest")).toContain("DESC");
  });
});
