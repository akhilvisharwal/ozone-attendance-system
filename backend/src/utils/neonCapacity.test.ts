import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env";
import { fetchNeonStorageInfo, __resetNeonWarnCacheForTests } from "./neonCapacity";

type FetchArgs = { url: string; init: RequestInit | undefined };

const realFetch = globalThis.fetch;
const realApiKey = env.neonApiKey;
const realProjectId = env.neonProjectId;

function stubFetch(handler: (args: FetchArgs) => Response | Promise<Response>) {
  const calls: FetchArgs[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const args = { url: String(input), init };
    calls.push(args);
    return handler(args);
  }) as typeof globalThis.fetch;
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchNeonStorageInfo", () => {
  beforeEach(() => {
    env.neonApiKey = "napi_test_key";
    env.neonProjectId = "dawn-base-73512925";
    __resetNeonWarnCacheForTests();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    env.neonApiKey = realApiKey;
    env.neonProjectId = realProjectId;
  });

  it("reads synthetic_storage_size from the documented project response", async () => {
    // Shape per https://api-docs.neon.tech/reference/getproject
    const calls = stubFetch(() =>
      jsonResponse({ project: { id: "dawn-base-73512925", synthetic_storage_size: 48_412_672 } })
    );

    const info = await fetchNeonStorageInfo();

    assert.deepEqual(info, { syntheticStorageBytes: 48_412_672 });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://console.neon.tech/api/v2/projects/dawn-base-73512925"
    );
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer napi_test_key");
  });

  it("accepts a zero-byte project without treating it as a failure", async () => {
    stubFetch(() => jsonResponse({ project: { synthetic_storage_size: 0 } }));
    assert.deepEqual(await fetchNeonStorageInfo(), { syntheticStorageBytes: 0 });
  });

  it("returns null for a branch-shaped response that has no synthetic_storage_size", async () => {
    // Regression guard: the branch endpoint (GET /projects/{id}/branches/{id}) only
    // exposes logical_size — there is no physical_size field. Reading that endpoint
    // silently produced no provider size at all.
    stubFetch(() => jsonResponse({ branch: { id: "br_x", logical_size: 12_345 } }));
    assert.equal(await fetchNeonStorageInfo(), null);
  });

  it("returns null when the API rejects the key", async () => {
    stubFetch(() => jsonResponse({ message: "Unauthorized" }, 401));
    assert.equal(await fetchNeonStorageInfo(), null);
  });

  it("returns null when the request throws", async () => {
    stubFetch(() => {
      throw new Error("network down");
    });
    assert.equal(await fetchNeonStorageInfo(), null);
  });

  it("skips the API call entirely when not configured", async () => {
    env.neonApiKey = "";
    env.neonProjectId = "";
    const calls = stubFetch(() => jsonResponse({}));

    assert.equal(await fetchNeonStorageInfo(), null);
    assert.equal(calls.length, 0);
  });
});
