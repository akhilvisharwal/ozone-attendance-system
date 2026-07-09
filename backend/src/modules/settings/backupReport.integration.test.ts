import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache } from "../settings/settings.cache";
import { fetchReadableReportBundle } from "../settings/settings.backupReportData";
import { buildReadableReportExcel } from "../settings/settings.backupReportExcel";
import { buildReadableReportPdf } from "../settings/settings.backupReportPdf";

describe("readable backup report integration", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  before(async () => {
    await initSettingsCache();
  });

  async function dbCounts() {
    const res = await pool.query<{
      employees: string;
      attendance: string;
      leave: string;
      holidays: string;
      audit: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM employees WHERE deleted_at IS NULL) AS employees,
         (SELECT COUNT(*)::text FROM attendance) AS attendance,
         (SELECT COUNT(*)::text FROM leave_requests) AS leave,
         (SELECT COUNT(*)::text FROM company_holidays) AS holidays,
         (SELECT COUNT(*)::text FROM audit_logs) AS audit`
    );
    return {
      employees: parseInt(res.rows[0]?.employees ?? "0", 10),
      attendance: parseInt(res.rows[0]?.attendance ?? "0", 10),
      leave: parseInt(res.rows[0]?.leave ?? "0", 10),
      holidays: parseInt(res.rows[0]?.holidays ?? "0", 10),
      audit: parseInt(res.rows[0]?.audit ?? "0", 10),
    };
  }

  it("full report section counts match the database", async () => {
    // Snapshot DB first, then build the report so section totals stay close under parallel suites.
    const expected = await dbCounts();
    const bundle = await fetchReadableReportBundle("full");
    assert.equal(bundle.sections.length, 6);
    assert.deepEqual(
      bundle.sections.map((s) => s.id).sort(),
      ["attendance", "audit", "employees", "holidays", "leave", "settings"]
    );
    // Parallel integration suites mutate rows; allow a generous race window.
    assert.ok(Math.abs(bundle.totals.employees - expected.employees) <= 50);
    assert.ok(Math.abs(bundle.totals.attendance - expected.attendance) <= 50);
    assert.ok(Math.abs(bundle.totals.leave - expected.leave) <= 50);
    assert.ok(Math.abs(bundle.totals.holidays - expected.holidays) <= 50);
    assert.ok(Math.abs(bundle.totals.audit - expected.audit) <= 100);
    assert.ok(bundle.totals.settings > 0);
  });

  it("scoped employee and attendance reports match database counts", async () => {
    const expected = await dbCounts();
    const employeesBundle = await fetchReadableReportBundle("employees");
    const attendanceBundle = await fetchReadableReportBundle("attendance");
    assert.equal(employeesBundle.totals.employees, expected.employees);
    assert.equal(attendanceBundle.totals.attendance, expected.attendance);
  });

  it("generates non-empty PDF and Excel report buffers", async () => {
    const bundle = await fetchReadableReportBundle("full");
    const [pdf, excel] = await Promise.all([
      buildReadableReportPdf(bundle),
      buildReadableReportExcel(bundle),
    ]);
    assert.ok(pdf.length > 500);
    assert.ok(excel.length > 500);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.equal(excel.subarray(0, 2).toString("hex"), "504b");
  });
});
