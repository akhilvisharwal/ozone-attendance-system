import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isInactiveSince, msUntilInactivityExpiry } from "./sessionActivity";

describe("sessionActivity", () => {
  const base = new Date("2026-07-09T12:00:00.000Z");

  it("detects inactivity after the configured timeout", () => {
    const now = new Date(base.getTime() + 15 * 60_000);
    assert.equal(isInactiveSince(base, now, 15), true);
  });

  it("treats activity within the timeout window as active", () => {
    const now = new Date(base.getTime() + 14 * 60_000 + 59_000);
    assert.equal(isInactiveSince(base, now, 15), false);
  });

  it("computes remaining time until inactivity expiry", () => {
    const now = new Date(base.getTime() + 10 * 60_000);
    assert.equal(msUntilInactivityExpiry(base, now, 15), 5 * 60_000);
  });

  it("never returns negative remaining time", () => {
    const now = new Date(base.getTime() + 20 * 60_000);
    assert.equal(msUntilInactivityExpiry(base, now, 15), 0);
  });
});
