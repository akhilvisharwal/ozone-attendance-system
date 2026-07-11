import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";

function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("browserSession", () => {
  before(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: createSessionStorageMock(),
      configurable: true,
    });
  });

  afterEach(async () => {
    const { clearBrowserSession } = await import("./browserSession");
    clearBrowserSession();
  });

  it("starts without an active browser session marker", async () => {
    const { hasBrowserSession } = await import("./browserSession");
    assert.equal(hasBrowserSession(), false);
  });

  it("marks and clears the browser session marker", async () => {
    const { clearBrowserSession, hasBrowserSession, markBrowserSession } = await import("./browserSession");
    markBrowserSession();
    assert.equal(hasBrowserSession(), true);
    clearBrowserSession();
    assert.equal(hasBrowserSession(), false);
  });
});
