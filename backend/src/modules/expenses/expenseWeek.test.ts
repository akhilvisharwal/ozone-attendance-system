import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatWeekLabel, weekEndSunday, weekStartMonday } from "./expenseWeek";

describe("expenseWeek", () => {
  it("maps mid-week dates to Monday", () => {
    assert.equal(weekStartMonday("2026-07-10"), "2026-07-06"); // Friday → Monday
    assert.equal(weekStartMonday("2026-07-06"), "2026-07-06"); // Monday
    assert.equal(weekStartMonday("2026-07-12"), "2026-07-06"); // Sunday → Monday
  });

  it("computes Sunday end and label", () => {
    assert.equal(weekEndSunday("2026-07-06"), "2026-07-12");
    assert.equal(formatWeekLabel("2026-07-06"), "2026-07-06 → 2026-07-12");
  });
});
