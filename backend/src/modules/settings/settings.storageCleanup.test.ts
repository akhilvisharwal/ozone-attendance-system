import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLEANUP_CATEGORIES } from "./settings.storageCleanup";

describe("storage cleanup categories", () => {
  it("exposes only the four main cleanup categories", () => {
    assert.deepEqual(CLEANUP_CATEGORIES, [
      "attendance_records",
      "selfies",
      "location_history",
      "audit_logs",
    ]);
  });
});
