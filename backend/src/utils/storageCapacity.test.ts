import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStorageCapacity,
  DEFAULT_DATABASE_CAPACITY_BYTES,
  parseStorageLimitBytes,
  resolveDatabaseCapacityBytes,
} from "./storageCapacity";

describe("storage capacity helpers", () => {
  it("parses plan limits with unit suffixes", () => {
    assert.equal(parseStorageLimitBytes("512MB"), 512 * 1024 * 1024);
    assert.equal(parseStorageLimitBytes("1GB"), 1024 ** 3);
    assert.equal(parseStorageLimitBytes("2048"), 2048);
    assert.equal(parseStorageLimitBytes(""), null);
  });

  it("defaults to 1 GB when nothing is configured", () => {
    const resolved = resolveDatabaseCapacityBytes({});
    assert.equal(resolved.maxBytes, DEFAULT_DATABASE_CAPACITY_BYTES);
    assert.equal(resolved.capacityGb, 1);
    assert.equal(resolved.limitSource, "default");
  });

  it("prefers admin-configured capacity over env and default", () => {
    const resolved = resolveDatabaseCapacityBytes({
      configuredCapacityGb: 2,
      envLimit: "1GB",
    });
    assert.equal(resolved.limitSource, "manual");
    assert.equal(resolved.maxBytes, 2 * 1024 ** 3);
  });

  it("uses env limit when admin capacity is not set", () => {
    const resolved = resolveDatabaseCapacityBytes({
      envLimit: "512MB",
    });
    assert.equal(resolved.limitSource, "env");
    assert.equal(resolved.maxBytes, 512 * 1024 * 1024);
  });

  it("builds capacity from PostgreSQL used bytes and plan limit only", () => {
    const capacity = buildStorageCapacity({
      usedBytes: 400 * 1024 * 1024,
      configuredCapacityGb: 1,
    });
    assert.equal(capacity.limitSource, "manual");
    assert.equal(capacity.maxBytes, 1024 * 1024 * 1024);
    assert.equal(capacity.remainingBytes, 624 * 1024 * 1024);
    assert.equal(capacity.percentUsed, 39.1);
    assert.equal(capacity.warningLevel, "none");
    assert.equal(capacity.warnings.length, 0);
  });

  it("never falls back to local disk capacity", () => {
    const capacity = buildStorageCapacity({ usedBytes: 100 });
    assert.equal(capacity.limitSource, "default");
    assert.equal(capacity.maxBytes, DEFAULT_DATABASE_CAPACITY_BYTES);
    assert.notEqual(capacity.limitSource, "disk" as never);
  });

  it("emits warning alerts at 70%, 85%, and 95%", () => {
    const warn = buildStorageCapacity({ usedBytes: 70, envLimit: "100" });
    assert.equal(warn.warningLevel, "warning");
    assert.equal(warn.warnings.length, 1);

    const high = buildStorageCapacity({ usedBytes: 85, envLimit: "100" });
    assert.equal(high.warningLevel, "high");
    assert.equal(high.warnings.length, 2);

    const critical = buildStorageCapacity({ usedBytes: 95, envLimit: "100" });
    assert.equal(critical.warningLevel, "critical");
    assert.equal(critical.warnings.length, 3);
  });
});
