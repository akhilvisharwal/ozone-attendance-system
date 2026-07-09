import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatCountdown,
  getWarningLeadMs,
  msUntilInactivityLogout,
  msUntilInactivityWarning,
} from "./sessionTiming";

describe("sessionTiming", () => {
  it("shows warning two minutes before a 15-minute timeout", () => {
    assert.equal(getWarningLeadMs(15), 2 * 60_000);
  });

  it("caps warning lead when timeout is shorter than warning window", () => {
    assert.equal(getWarningLeadMs(5), 2 * 60_000);
  });

  it("schedules warning before logout", () => {
    const lastActivity = 1_000_000;
    const now = lastActivity + 13 * 60_000;
    assert.equal(msUntilInactivityWarning(15, lastActivity, now), 0);
    assert.equal(msUntilInactivityLogout(15, lastActivity, now), 2 * 60_000);
  });

  it("formats countdown labels", () => {
    assert.equal(formatCountdown(125), "2:05");
    assert.equal(formatCountdown(8), "0:08");
  });
});
