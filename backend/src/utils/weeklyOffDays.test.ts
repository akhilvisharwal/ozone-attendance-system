import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatWeeklyOffDays,
  normalizeWeeklyOffDays,
  resolveWeeklyOffDays,
  weeklyOffDaysEqual,
} from "./weeklyOffDays";

describe("weeklyOffDays utils", () => {
  it("normalizes and deduplicates weekday arrays", () => {
    assert.deepEqual(normalizeWeeklyOffDays([6, 0, 0, 6]), [0, 6]);
  });

  it("compares weekly off arrays regardless of order", () => {
    assert.equal(weeklyOffDaysEqual([0, 6], [6, 0]), true);
    assert.equal(weeklyOffDaysEqual([0], [0, 6]), false);
  });

  it("formats weekly off labels", () => {
    assert.equal(formatWeeklyOffDays([0, 6]), "Sun, Sat");
    assert.equal(formatWeeklyOffDays([]), "No weekly off");
  });

  it("resolves default employees from settings at runtime", () => {
    const resolved = resolveWeeklyOffDays(
      { weekly_off_days: [0], uses_default_weekly_off: true },
      [3]
    );
    assert.deepEqual(resolved, [3]);
  });

  it("keeps custom employee schedules separate from default", () => {
    const resolved = resolveWeeklyOffDays(
      { weekly_off_days: [1, 6], uses_default_weekly_off: false },
      [3]
    );
    assert.deepEqual(resolved, [1, 6]);
  });
});
