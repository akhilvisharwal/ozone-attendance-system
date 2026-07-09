import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBackupPayload,
  formatDatabaseSize,
  normalizeBackupSettings,
  parseBackupPayload,
} from "./backupHelpers";

describe("backup helpers", () => {
  it("normalizes backup settings defaults", () => {
    const normalized = normalizeBackupSettings(undefined);
    assert.equal(normalized.automaticDailyBackup, false);
    assert.equal(normalized.lastBackupAt, null);
    assert.equal(normalized.databaseCapacityGb, 1);
  });

  it("builds backup payload manifest counts", () => {
    const payload = buildBackupPayload("employees", {
      employees: [{ id: "1" }, { id: "2" }],
    });
    assert.equal(payload.manifest.version, 1);
    assert.equal(payload.manifest.type, "employees");
    assert.equal(payload.manifest.tableCounts.employees, 2);
  });

  it("parses full backup payloads for restore", () => {
    const payload = buildBackupPayload("full", {
      employees: [{ id: "emp-1", employee_code: "TST001" }],
      attendance: [],
    });
    const parsed = parseBackupPayload(payload);
    assert.equal(parsed.manifest.type, "full");
    assert.equal(parsed.tables.employees.length, 1);
  });

  it("rejects non-full restore payloads", () => {
    const payload = buildBackupPayload("attendance", { attendance: [{ id: "1" }] });
    assert.throws(() => parseBackupPayload(payload), /Only full backups can be restored/);
  });

  it("formats database sizes", () => {
    assert.equal(formatDatabaseSize(512), "512 B");
    assert.equal(formatDatabaseSize(2048), "2.0 KB");
    assert.equal(formatDatabaseSize(5 * 1024 * 1024), "5.0 MB");
  });
});
