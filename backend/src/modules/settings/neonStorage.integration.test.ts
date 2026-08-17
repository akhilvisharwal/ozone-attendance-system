import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "../../config/env";
import { __resetNeonWarnCacheForTests } from "../../utils/neonCapacity";
import { getStorageBreakdown } from "./settings.storage";

/**
 * Proves the full wiring against the real local database: a provider-reported storage
 * size (Neon's synthetic_storage_size) must become the headline "physical database
 * size" and drive the capacity math, while pg_database_size() is retained only as a
 * labelled reference figure.
 */
describe(
  "Neon storage wiring",
  { skip: process.env.SKIP_DB_TESTS === "1" },
  () => {
    const realFetch = globalThis.fetch;
    const realApiKey = env.neonApiKey;
    const realProjectId = env.neonProjectId;

    beforeEach(() => {
      __resetNeonWarnCacheForTests();
    });

    afterEach(() => {
      globalThis.fetch = realFetch;
      env.neonApiKey = realApiKey;
      env.neonProjectId = realProjectId;
    });

    function stubNeon(syntheticStorageSize: number) {
      env.neonApiKey = "napi_test_key";
      env.neonProjectId = "dawn-base-73512925";
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ project: { synthetic_storage_size: syntheticStorageSize } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof globalThis.fetch;
    }

    it("uses Neon's metered size as the headline figure and keeps pg_database_size as reference", async () => {
      // Deliberately far larger than the local database so the two are distinguishable.
      const neonBytes = 987_654_321;
      stubNeon(neonBytes);

      const storage = await getStorageBreakdown();

      assert.equal(storage.physicalSizeFromProvider, true);
      assert.equal(storage.physicalDatabaseBytes, neonBytes);
      assert.equal(storage.databaseSizeBytes, neonBytes);
      // Capacity/percentage math must be driven by the provider figure.
      assert.equal(storage.capacity.usedBytes, neonBytes);
      // pg_database_size is still measured, kept separate, and is the smaller number.
      assert.ok(storage.postgresLogicalBytes > 0);
      assert.notEqual(storage.postgresLogicalBytes, neonBytes);
      assert.ok(storage.postgresLogicalBytes < neonBytes);
      // Uploaded files are counted on top of the database figure, never inside it.
      assert.equal(
        storage.totalStorageUsedBytes,
        neonBytes + storage.uploadedFilesBytes
      );
      assert.match(storage.reclaimableExplanation, /Neon/);
    });

    it("falls back to pg_database_size when the Neon lookup fails", async () => {
      env.neonApiKey = "napi_test_key";
      env.neonProjectId = "dawn-base-73512925";
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })) as typeof globalThis.fetch;

      const storage = await getStorageBreakdown();

      assert.equal(storage.physicalSizeFromProvider, false);
      assert.equal(storage.physicalDatabaseBytes, storage.postgresLogicalBytes);
      assert.equal(storage.databaseSizeBytes, storage.postgresLogicalBytes);
      assert.equal(storage.capacity.usedBytes, storage.postgresLogicalBytes);
    });
  }
);
