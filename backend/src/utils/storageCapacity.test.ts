import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStorageCapacity,
  parseStorageLimitBytes,
  type ResolvedCapacity,
} from "./storageCapacity";

const GB = 1024 ** 3;

describe("storage capacity helpers", () => {
  it("parses plan limits with unit suffixes", () => {
    assert.equal(parseStorageLimitBytes("512MB"), 512 * 1024 * 1024);
    assert.equal(parseStorageLimitBytes("1GB"), GB);
    assert.equal(parseStorageLimitBytes("2048"), 2048);
    assert.equal(parseStorageLimitBytes(""), null);
    assert.equal(parseStorageLimitBytes(null), null);
  });

  it("builds capacity from a detected provider limit", () => {
    const resolved: ResolvedCapacity = {
      maxBytes: GB,
      limitSource: "provider",
      limitDescription: "Detected from Render.",
    };
    const capacity = buildStorageCapacity({ usedBytes: 400 * 1024 * 1024, resolved });
    assert.equal(capacity.detected, true);
    assert.equal(capacity.limitSource, "provider");
    assert.equal(capacity.maxBytes, GB);
    assert.equal(capacity.remainingBytes, 624 * 1024 * 1024);
    assert.equal(capacity.percentUsed, 39.1);
    assert.equal(capacity.capacityGb, 1);
    assert.equal(capacity.warningLevel, "none");
    assert.equal(capacity.warnings.length, 0);
  });

  it("reports capacity as unavailable when the maximum is unknown", () => {
    const resolved: ResolvedCapacity = {
      maxBytes: null,
      limitSource: "unavailable",
      limitDescription: "Could not be determined automatically.",
    };
    const capacity = buildStorageCapacity({ usedBytes: 100 * 1024 * 1024, resolved });
    assert.equal(capacity.detected, false);
    assert.equal(capacity.limitSource, "unavailable");
    assert.equal(capacity.maxBytes, null);
    assert.equal(capacity.maxLabel, "Not available");
    assert.equal(capacity.remainingBytes, null);
    assert.equal(capacity.remainingLabel, "Not available");
    assert.equal(capacity.percentUsed, null);
    assert.equal(capacity.capacityGb, null);
    assert.equal(capacity.warningLevel, "none");
    assert.equal(capacity.warnings.length, 0);
    // Current usage is still reported accurately.
    assert.equal(capacity.usedBytes, 100 * 1024 * 1024);
  });

  it("never estimates a maximum when none is provided", () => {
    const capacity = buildStorageCapacity({
      usedBytes: 100,
      resolved: { maxBytes: 0, limitSource: "unavailable", limitDescription: "" },
    });
    assert.equal(capacity.maxBytes, null);
    assert.equal(capacity.detected, false);
  });

  it("emits warning alerts at 70%, 85%, and 95%", () => {
    const mk = (usedBytes: number): ResolvedCapacity => ({
      maxBytes: 100,
      limitSource: "env",
      limitDescription: "env",
    });

    const warn = buildStorageCapacity({ usedBytes: 70, resolved: mk(70) });
    assert.equal(warn.warningLevel, "warning");
    assert.equal(warn.warnings.length, 1);

    const high = buildStorageCapacity({ usedBytes: 85, resolved: mk(85) });
    assert.equal(high.warningLevel, "high");
    assert.equal(high.warnings.length, 2);

    const critical = buildStorageCapacity({ usedBytes: 95, resolved: mk(95) });
    assert.equal(critical.warningLevel, "critical");
    assert.equal(critical.warnings.length, 3);
  });
});
