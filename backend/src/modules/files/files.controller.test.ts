import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "path";

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "files.controller.ts"),
  "utf8"
);

describe("protected file access for signatures", () => {
  it("does not share official signatures with other junior admins", () => {
    assert.match(source, /if \(category === "signatures"\) return false;/);
  });

  it("still allows the owner or master admin to read their own signature file", () => {
    assert.match(source, /const isOwner = req\.user!\.employeeCode === ownerCode;/);
    assert.match(source, /if \(req\.user!\.role === "admin"\) return true;/);
  });
});
