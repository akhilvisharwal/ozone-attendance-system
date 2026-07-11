import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isGpsAccuracyAcceptable,
  normalizeGpsAccuracy,
} from "./useGeolocation";

describe("GPS accuracy helpers", () => {
  it("normalizes invalid accuracy values to Infinity", () => {
    assert.equal(normalizeGpsAccuracy(undefined), Number.POSITIVE_INFINITY);
    assert.equal(normalizeGpsAccuracy(null), Number.POSITIVE_INFINITY);
    assert.equal(normalizeGpsAccuracy(Number.NaN), Number.POSITIVE_INFINITY);
    assert.equal(normalizeGpsAccuracy(-1), Number.POSITIVE_INFINITY);
  });

  it("accepts finite non-negative accuracy values", () => {
    assert.equal(normalizeGpsAccuracy(0), 0);
    assert.equal(normalizeGpsAccuracy(42.5), 42.5);
  });

  it("compares accuracy against the configured threshold", () => {
    assert.equal(isGpsAccuracyAcceptable(80, 100), true);
    assert.equal(isGpsAccuracyAcceptable(100, 100), true);
    assert.equal(isGpsAccuracyAcceptable(101, 100), false);
    assert.equal(isGpsAccuracyAcceptable(undefined, 100), false);
  });
});
