import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPastTimeCutoff } from "./autoAbsence.service";
import { parseClosingTime } from "../modules/attendance/attendanceRules.service";

describe("isPastTimeCutoff", () => {
  const date = "2026-07-08";

  it("returns false before the employee closing time on the same day", () => {
    const now = new Date(2026, 6, 8, 13, 59, 0);
    assert.equal(isPastTimeCutoff(now, parseClosingTime("14:00"), date), false);
  });

  it("returns true at or after the employee closing time on the same day", () => {
    const atCutoff = new Date(2026, 6, 8, 14, 0, 0);
    const afterCutoff = new Date(2026, 6, 8, 17, 5, 0);
    assert.equal(isPastTimeCutoff(atCutoff, parseClosingTime("14:00"), date), true);
    assert.equal(isPastTimeCutoff(afterCutoff, parseClosingTime("17:00"), date), true);
  });

  it("returns true for historical dates regardless of clock time", () => {
    const morning = new Date(2026, 6, 9, 9, 0, 0);
    assert.equal(isPastTimeCutoff(morning, parseClosingTime("17:00"), "2026-07-08"), true);
  });
});
