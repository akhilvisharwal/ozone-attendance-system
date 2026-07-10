import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  buildExpenseExcelReport,
  buildExpensePdfReport,
  buildExpenseReportBundle,
  buildExpenseReportSummary,
} from "./expenses.reports";
import type { ExpenseRow } from "./expenses.repository";

function sampleExpense(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: "exp-1",
    employee_id: "emp-1",
    expense_date: "2026-07-08",
    amount: "250",
    payment_method: "upi",
    category: "travel",
    description: "Client visit",
    receipt_path: "/uploads/expense-receipts/JA001/receipt.jpg",
    status: "paid",
    admin_remarks: null,
    reviewed_by: "admin-1",
    reviewed_at: "2026-07-09T10:30:00.000Z",
    week_start: "2026-07-07",
    request_id: "req-1",
    created_at: "2026-07-08T06:15:00.000Z",
    updated_at: "2026-07-09T10:30:00.000Z",
    employee_name: "Junior Admin",
    employee_code: "JA001",
    reviewed_by_name: "Master Admin",
    week_paid_at: "2026-07-10T08:00:00.000Z",
    week_paid_by_name: "Master Admin",
    ...overrides,
  };
}

describe("expense report exports", () => {
  it("maps database fields into report rows with labels and formatted values", () => {
    const expenses = [
      sampleExpense(),
      sampleExpense({
        id: "exp-2",
        expense_date: "2026-07-09",
        amount: "120",
        category: "food",
        payment_method: "cash",
        status: "rejected",
        admin_remarks: "Missing receipt",
        receipt_path: null,
        week_paid_at: null,
        created_at: "2026-07-09T04:00:00.000Z",
      }),
      sampleExpense({
        id: "exp-3",
        expense_date: "2026-07-10",
        amount: "80",
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        reviewed_by_name: null,
        week_paid_at: null,
        created_at: "2026-07-10T02:00:00.000Z",
      }),
    ];

    const bundle = buildExpenseReportBundle(expenses);

    assert.equal(bundle.rows.length, 3);
    assert.equal(bundle.rows[0].amount, 250);
    assert.equal(bundle.rows[0].category, "Travel");
    assert.equal(bundle.rows[0].payment_method, "UPI");
    assert.equal(bundle.rows[0].status, "Paid");
    assert.equal(bundle.rows[0].approver, "Master Admin");
    assert.equal(bundle.rows[0].receipt_available, "Yes");
    assert.notEqual(bundle.rows[0].payment_date, "-");
    assert.notEqual(bundle.rows[0].review_date_time, "-");

    assert.equal(bundle.rows[1].status, "Rejected");
    assert.equal(bundle.rows[1].rejection_reason, "Missing receipt");
    assert.equal(bundle.rows[1].receipt_available, "No");
    assert.equal(bundle.rows[1].payment_date, "-");

    assert.equal(bundle.rows[2].status, "Pending");
    assert.equal(bundle.rows[2].approver, "-");
    assert.equal(bundle.rows[2].review_date_time, "-");

    assert.equal(bundle.summary.totalTransactions, 3);
    assert.equal(bundle.summary.totalRequested, 450);
    assert.equal(bundle.summary.totalPaid, 250);
    assert.equal(bundle.summary.totalRejected, 120);
    assert.equal(bundle.summary.totalPending, 80);
    assert.equal(bundle.summary.totalApproved, 0);
  });

  it("computes summary totals exactly from expense statuses", () => {
    const summary = buildExpenseReportSummary([
      sampleExpense({ amount: "100", status: "approved" }),
      sampleExpense({ amount: "50", status: "draft" }),
      sampleExpense({ amount: "25", status: "archived" }),
    ]);

    assert.equal(summary.totalTransactions, 3);
    assert.equal(summary.totalRequested, 175);
    assert.equal(summary.totalApproved, 100);
    assert.equal(summary.totalPending, 50);
    assert.equal(summary.totalPaid, 25);
  });

  it("sorts rows when created_at is a Date object from the database driver", () => {
    const bundle = buildExpenseReportBundle([
      sampleExpense({
        id: "b",
        expense_date: "2026-07-10",
        amount: "10",
        created_at: new Date("2026-07-10T12:00:00.000Z") as unknown as string,
      }),
      sampleExpense({
        id: "a",
        expense_date: "2026-07-08",
        amount: "20",
        created_at: new Date("2026-07-08T12:00:00.000Z") as unknown as string,
      }),
    ]);

    assert.equal(bundle.rows[0].amount, 20);
    assert.equal(bundle.rows[1].amount, 10);
  });

  it("sorts rows chronologically by expense date", () => {
    const bundle = buildExpenseReportBundle([
      sampleExpense({ id: "b", expense_date: "2026-07-10", amount: "10", created_at: "2026-07-10T01:00:00.000Z" }),
      sampleExpense({ id: "a", expense_date: "2026-07-08", amount: "20", created_at: "2026-07-08T01:00:00.000Z" }),
    ]);

    assert.equal(bundle.rows[0].amount, 20);
    assert.equal(bundle.rows[1].amount, 10);
  });

  it("builds multi-page PDF exports without hanging", async () => {
    const rows = Array.from({ length: 80 }, (_, index) =>
      sampleExpense({
        id: `exp-${index}`,
        expense_date: "2026-07-08",
        created_at: `2026-07-08T0${index % 9}:00:00.000Z`,
      })
    );
    const bundle = buildExpenseReportBundle(rows);
    const pdf = await buildExpensePdfReport(bundle, "multi-page test");
    assert.ok(pdf.length > 1000);
  });

  it("builds non-empty PDF and Excel exports with summary and detail sections", async () => {
    const bundle = buildExpenseReportBundle([
      sampleExpense(),
      sampleExpense({ id: "exp-2", status: "pending", amount: "40" }),
    ]);
    const title = "weekly report (2026-07-07 to 2026-07-13)";

    const pdf = await buildExpensePdfReport(bundle, title);
    const excel = await buildExpenseExcelReport(bundle, title);

    assert.ok(pdf.length > 500);
    assert.ok(excel.length > 1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel);
    const sheet = workbook.getWorksheet("Expense Report");
    assert.ok(sheet);

    assert.match(String(sheet.getCell(1, 1).value), /Expense Report/);
    assert.equal(sheet.getCell(4, 1).value, "Summary");
    assert.equal(sheet.getCell(5, 1).value, "Total Transactions");
    assert.equal(sheet.getCell(5, 2).value, 2);

    const headerRow = sheet.getRow(12);
    assert.equal(headerRow.getCell(1).value, "Date");
    assert.equal(headerRow.getCell(7).value, "Amount");
    assert.equal(headerRow.getCell(13).value, "Receipt Available");

    const dataRow = sheet.getRow(13);
    assert.equal(dataRow.getCell(3).value, "Junior Admin (JA001)");
    assert.equal(dataRow.getCell(4).value, "Travel");
    assert.equal(dataRow.getCell(13).value, "Yes");
  });
});
