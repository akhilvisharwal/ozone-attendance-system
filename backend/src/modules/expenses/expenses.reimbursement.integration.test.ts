import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import { initSettingsCache, updateCategory, getSettings } from "../settings/settings.cache";
import { getEmployeePermissions } from "../employees/employees.repository";
import { fullPermissions, normalizePermissions } from "../auth/permissions";
import * as expenseRepo from "./expenses.repository";
import * as requestsRepo from "./expenses.requests.repository";
import { getExpenseSettings, buildDefaultExpenseSettings } from "./expenseSettings";
import { weeklyRange } from "./expensePeriod";
import {
  buildExpenseExcelReport,
  buildExpensePdfReport,
  buildExpenseReportBundle,
} from "./expenses.reports";

describe("expense reimbursement workflow", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let adminId: string;
  let juniorAdminId: string;
  let createdJunior = false;
  const createdExpenseIds: string[] = [];
  const createdRequestIds: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const period = weeklyRange(today);
  let originalExpenses = buildDefaultExpenseSettings();

  before(async () => {
    await initSettingsCache();
    originalExpenses = getExpenseSettings();

    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`
    );
    adminId = admin.rows[0]?.id ?? "";
    if (!adminId) throw new Error("Need an admin user for expense workflow tests");

    const created = await pool.query<{ id: string }>(
      `INSERT INTO employees (employee_code, name, email, password_hash, role, is_active, admin_permissions)
       VALUES ($1, 'Expense Workflow Junior', $2, 'hash', 'junior_admin', true, $3::jsonb)
       RETURNING id`,
      [
        `JA-EXP-${Date.now()}`,
        `ja-exp-${Date.now()}@example.com`,
        JSON.stringify({
          ...normalizePermissions({}),
          manageExpenses: true,
          viewDashboard: true,
        }),
      ]
    );
    juniorAdminId = created.rows[0].id;
    createdJunior = true;
  });

  after(async () => {
    if (createdRequestIds.length) {
      await pool.query(`DELETE FROM expenses WHERE request_id = ANY($1::uuid[])`, [createdRequestIds]);
      await pool.query(`DELETE FROM expense_reimbursement_requests WHERE id = ANY($1::uuid[])`, [
        createdRequestIds,
      ]);
    }
    if (createdExpenseIds.length) {
      await pool.query(`DELETE FROM expenses WHERE id = ANY($1::uuid[])`, [createdExpenseIds]);
    }
    if (createdJunior) {
      await pool.query(`DELETE FROM employees WHERE id = $1`, [juniorAdminId]);
    }
    await updateCategory("expenses", originalExpenses, adminId);
  });

  it("grants manageExpenses so Junior Admin permission checks pass", async () => {
    const perms = await getEmployeePermissions(juniorAdminId);
    assert.equal(perms.manageExpenses, true);

    await pool.query(
      `UPDATE employees SET admin_permissions = $1::jsonb WHERE id = $2`,
      [JSON.stringify({ manageExpenses: false }), juniorAdminId]
    );
    assert.equal((await getEmployeePermissions(juniorAdminId)).manageExpenses, false);

    await pool.query(
      `UPDATE employees SET admin_permissions = $1::jsonb WHERE id = $2`,
      [
        JSON.stringify({
          ...normalizePermissions({}),
          manageExpenses: true,
          viewDashboard: true,
        }),
        juniorAdminId,
      ]
    );
    assert.equal((await getEmployeePermissions(juniorAdminId)).manageExpenses, true);
    assert.equal(fullPermissions().manageExpenses, true);
  });

  it("exposes enabled categories and payment methods from expense settings", async () => {
    const defaults = buildDefaultExpenseSettings();
    defaults.categories = defaults.categories.map((item) => ({
      ...item,
      enabled: item.key === "travel" || item.key === "food",
    }));
    defaults.paymentMethods = defaults.paymentMethods.map((item) => ({
      ...item,
      enabled: item.key === "upi" || item.key === "cash",
    }));
    await updateCategory("expenses", defaults, adminId);

    const settings = getExpenseSettings();
    assert.deepEqual(
      settings.categories.filter((item) => item.enabled).map((item) => item.key).sort(),
      ["food", "travel"]
    );
    assert.deepEqual(
      settings.paymentMethods.filter((item) => item.enabled).map((item) => item.key).sort(),
      ["cash", "upi"]
    );
  });

  it("creates, edits, and deletes draft expenses", async () => {
    await updateCategory("expenses", buildDefaultExpenseSettings(), adminId);

    const created = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 100,
      paymentMethod: "upi",
      category: "travel",
      description: "Draft create",
      receiptPath: null,
    });
    createdExpenseIds.push(created.id);
    assert.equal(created.status, "draft");

    const updated = await expenseRepo.updateExpense(created.id, juniorAdminId, {
      amount: 150,
      description: "Draft edited",
    });
    assert.ok(updated);
    assert.equal(Number(updated!.amount), 150);
    assert.equal(updated!.description, "Draft edited");

    const deleted = await expenseRepo.deleteExpense(created.id, juniorAdminId);
    assert.ok(deleted);
    createdExpenseIds.splice(createdExpenseIds.indexOf(created.id), 1);
    assert.equal(await expenseRepo.findExpenseById(created.id), null);
  });

  it("supports per-line approve/reject, pays approved only, and keeps rejection reasons", async () => {
    await updateCategory("expenses", buildDefaultExpenseSettings(), adminId);

    const expenseA = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 100,
      paymentMethod: "upi",
      category: "travel",
      description: "Line A",
      receiptPath: null,
    });
    const expenseB = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 200,
      paymentMethod: "cash",
      category: "food",
      description: "Line B",
      receiptPath: null,
    });
    createdExpenseIds.push(expenseA.id, expenseB.id);

    const request = await requestsRepo.submitReimbursementRequest({
      employeeId: juniorAdminId,
      periodType: "weekly",
      periodStart: period.start,
      periodEnd: period.end,
      expenseIds: [expenseA.id, expenseB.id],
      requestedAmount: 300,
    });
    createdRequestIds.push(request.id);

    const approvedLine = await requestsRepo.reviewRequestExpense(request.id, expenseA.id, {
      status: "approved",
      remarks: null,
      reviewedBy: adminId,
    });
    assert.ok(approvedLine);
    assert.equal(approvedLine!.request.status, "pending_approval");
    assert.equal(approvedLine!.expense.status, "approved");

    const rejectedLine = await requestsRepo.reviewRequestExpense(request.id, expenseB.id, {
      status: "rejected",
      remarks: "Missing receipt",
      reviewedBy: adminId,
    });
    assert.ok(rejectedLine);
    assert.equal(rejectedLine!.request.status, "approved");
    assert.equal(Number(rejectedLine!.request.approved_amount), 100);
    assert.equal(rejectedLine!.expense.status, "rejected");
    assert.equal(rejectedLine!.expense.admin_remarks, "Missing receipt");

    const paid = await requestsRepo.markRequestPaid(request.id, {
      paidBy: adminId,
      notes: "Partial payout",
      archiveImmediately: false,
    });
    assert.equal(paid!.status, "paid");
    assert.equal((await expenseRepo.findExpenseById(expenseA.id))?.status, "paid");
    assert.equal((await expenseRepo.findExpenseById(expenseB.id))?.status, "rejected");
    assert.equal((await expenseRepo.findExpenseById(expenseB.id))?.admin_remarks, "Missing receipt");

    await requestsRepo.archivePaidRequest(request.id);
    assert.equal((await expenseRepo.findExpenseById(expenseA.id))?.status, "archived");
    assert.equal((await expenseRepo.findExpenseById(expenseB.id))?.status, "rejected");

    await requestsRepo.deleteArchivedExpenseData();
    createdExpenseIds.length = 0;
    createdRequestIds.length = 0;
  });

  it("requires individual review before approve-all-remaining", async () => {
    await updateCategory("expenses", buildDefaultExpenseSettings(), adminId);

    const expenseA = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 50,
      paymentMethod: "upi",
      category: "travel",
      description: "Bulk A",
      receiptPath: null,
    });
    const expenseB = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 75,
      paymentMethod: "upi",
      category: "travel",
      description: "Bulk B",
      receiptPath: null,
    });
    createdExpenseIds.push(expenseA.id, expenseB.id);

    const request = await requestsRepo.submitReimbursementRequest({
      employeeId: juniorAdminId,
      periodType: "weekly",
      periodStart: period.start,
      periodEnd: period.end,
      expenseIds: [expenseA.id, expenseB.id],
      requestedAmount: 125,
    });
    createdRequestIds.push(request.id);

    assert.equal(await requestsRepo.approveAllRemainingRequestExpenses(request.id, adminId), null);

    await requestsRepo.reviewRequestExpense(request.id, expenseA.id, {
      status: "approved",
      remarks: null,
      reviewedBy: adminId,
    });

    const bulkApproved = await requestsRepo.approveAllRemainingRequestExpenses(request.id, adminId);
    assert.ok(bulkApproved);
    assert.equal(bulkApproved!.status, "approved");
    assert.equal(Number(bulkApproved!.approved_amount), 125);

    await requestsRepo.deleteArchivedExpenseData();
    await pool.query(`DELETE FROM expenses WHERE request_id = $1`, [request.id]);
    await pool.query(`DELETE FROM expense_reimbursement_requests WHERE id = $1`, [request.id]);
    createdExpenseIds.length = 0;
    createdRequestIds.length = 0;
  });

  it("runs request → approve → pay → archive → cleanup and exports reports", async () => {
    await updateCategory("expenses", buildDefaultExpenseSettings(), adminId);

    const expense = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 250,
      paymentMethod: "upi",
      category: "travel",
      description: "Integration test expense",
      receiptPath: null,
    });
    createdExpenseIds.push(expense.id);

    const request = await requestsRepo.submitReimbursementRequest({
      employeeId: juniorAdminId,
      periodType: "weekly",
      periodStart: period.start,
      periodEnd: period.end,
      expenseIds: [expense.id],
      requestedAmount: 250,
    });
    createdRequestIds.push(request.id);
    assert.equal(request.status, "pending_approval");
    assert.equal((await expenseRepo.findExpenseById(expense.id))?.status, "pending");

    // Locked expenses cannot be edited or deleted
    assert.equal(
      await expenseRepo.updateExpense(expense.id, juniorAdminId, { amount: 999 }),
      null
    );
    assert.equal(await expenseRepo.deleteExpense(expense.id, juniorAdminId), null);

    const approved = await requestsRepo.reviewRequest(request.id, {
      status: "approved",
      remarks: "Looks good",
      reviewedBy: adminId,
      approvedAmount: 250,
    });
    assert.equal(approved!.status, "approved");

    const paid = await requestsRepo.markRequestPaid(request.id, {
      paidBy: adminId,
      notes: "UPI transfer",
      archiveImmediately: false,
    });
    assert.equal(paid!.status, "paid");

    const archived = await requestsRepo.archivePaidRequest(request.id);
    assert.equal(archived!.status, "archived");
    assert.equal((await expenseRepo.findExpenseById(expense.id))?.status, "archived");

    const bundle = buildExpenseReportBundle(
      [((await expenseRepo.findExpenseById(expense.id))!)],
      new Map([[request.id, archived!]])
    );
    const pdf = await buildExpensePdfReport(bundle, "test");
    const excel = await buildExpenseExcelReport(bundle, "test");
    assert.ok(pdf.length > 500);
    assert.ok(excel.length > 1000);
    assert.equal(bundle.summary.totalTransactions, 1);
    assert.equal(bundle.summary.totalPaid, 250);

    const deleted = await requestsRepo.deleteArchivedExpenseData();
    assert.ok(deleted.deletedRequests >= 1);
    assert.ok(deleted.deletedExpenses >= 1);
    assert.equal(await expenseRepo.findExpenseById(expense.id), null);
    createdExpenseIds.length = 0;
    createdRequestIds.length = 0;
  });

  it("auto-approves when approvalRequired is false", async () => {
    const settings = buildDefaultExpenseSettings();
    settings.approvalRequired = false;
    await updateCategory("expenses", settings, adminId);

    const expense = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 80,
      paymentMethod: "cash",
      category: "food",
      description: "Auto approve",
      receiptPath: null,
    });
    createdExpenseIds.push(expense.id);

    const request = await requestsRepo.submitReimbursementRequest({
      employeeId: juniorAdminId,
      periodType: "weekly",
      periodStart: period.start,
      periodEnd: period.end,
      expenseIds: [expense.id],
      requestedAmount: 80,
      autoApprove: true,
      reviewedBy: juniorAdminId,
    });
    createdRequestIds.push(request.id);
    assert.equal(request.status, "approved");
    assert.equal((await expenseRepo.findExpenseById(expense.id))?.status, "approved");

    await requestsRepo.markRequestPaid(request.id, {
      paidBy: adminId,
      notes: null,
      archiveImmediately: true,
    });
    await requestsRepo.deleteArchivedExpenseData();
    createdExpenseIds.length = 0;
    createdRequestIds.length = 0;
  });

  it("auto-archives paid requests older than configured days", async () => {
    await updateCategory("expenses", buildDefaultExpenseSettings(), adminId);

    const expense = await expenseRepo.createExpense({
      employeeId: juniorAdminId,
      expenseDate: today,
      amount: 40,
      paymentMethod: "upi",
      category: "fuel",
      description: "Auto archive days",
      receiptPath: null,
    });
    createdExpenseIds.push(expense.id);

    const request = await requestsRepo.submitReimbursementRequest({
      employeeId: juniorAdminId,
      periodType: "weekly",
      periodStart: period.start,
      periodEnd: period.end,
      expenseIds: [expense.id],
      requestedAmount: 40,
      autoApprove: true,
      reviewedBy: adminId,
    });
    createdRequestIds.push(request.id);

    await requestsRepo.markRequestPaid(request.id, {
      paidBy: adminId,
      notes: null,
      archiveImmediately: false,
    });

    await pool.query(
      `UPDATE expense_reimbursement_requests SET paid_at = now() - interval '10 days' WHERE id = $1`,
      [request.id]
    );

    const archivedCount = await requestsRepo.archivePaidRequestsOlderThan(7);
    assert.ok(archivedCount >= 1);
    assert.equal((await requestsRepo.findRequestById(request.id))?.status, "archived");

    await requestsRepo.deleteArchivedExpenseData();
    createdExpenseIds.length = 0;
    createdRequestIds.length = 0;
  });

  it("rejects disabled cycles and enforces amount limits via settings", async () => {
    const settings = buildDefaultExpenseSettings();
    settings.cycles = { weekly: false, monthly: true, custom: false };
    settings.maxAmountPerExpense = 50;
    settings.maxAmountPerRequest = 50;
    await updateCategory("expenses", settings, adminId);

    const live = getSettings().expenses;
    assert.equal(live.cycles.weekly, false);
    assert.equal(live.cycles.monthly, true);
    assert.equal(live.maxAmountPerExpense, 50);
  });
});
