import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAutomaticDayStatus } from "./attendanceDayStatus";
import { normalizeAttendanceSettings } from "../../utils/settingsHelpers";
import { getSettings } from "../settings/settings.cache";

const settings = normalizeAttendanceSettings(getSettings().attendance);

describe("resolveAutomaticDayStatus", () => {
  it("marks half day when autoCalculate is off and check-in was after half-day cutoff", () => {
    assert.equal(
      resolveAutomaticDayStatus({
        isHalfDay: true,
        checkInStatus: "half_day",
        totalMinutes: 60,
        autoCalculate: false,
        settings,
      }),
      "half_day"
    );
  });

  it("marks present when worked hours meet the full-day threshold", () => {
    assert.equal(
      resolveAutomaticDayStatus({
        isHalfDay: true,
        checkInStatus: "half_day",
        totalMinutes: 8 * 60,
        autoCalculate: true,
        settings,
      }),
      "present"
    );
  });

  it("marks half day when hours are between half-day and full-day thresholds", () => {
    assert.equal(
      resolveAutomaticDayStatus({
        isHalfDay: false,
        checkInStatus: "late",
        totalMinutes: 4 * 60,
        autoCalculate: true,
        settings,
      }),
      "half_day"
    );
  });

  it("marks absent when worked hours are below the half-day threshold", () => {
    assert.equal(
      resolveAutomaticDayStatus({
        isHalfDay: true,
        checkInStatus: "half_day",
        totalMinutes: 30,
        autoCalculate: true,
        settings,
      }),
      "absent"
    );
  });
});
