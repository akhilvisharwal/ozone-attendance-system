import type { Request, Response } from "express";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import { storage } from "../../services/storage";
import { logAudit } from "../audit/audit.repository";
import { resolveReimbursementPeriod } from "./expensePeriod";
import {
  enabledCategoryKeys,
  enabledPaymentMethodKeys,
  getExpenseSettings,
} from "./expenseSettings";
import {
  expenseCreateSchema,
  expenseExportQuerySchema,
  expenseListQuerySchema,
  expenseReviewSchema,
  expenseUpdateSchema,
  expenseWeekPaidSchema,
  reimbursementSubmitSchema,
  requestListQuerySchema,
  requestPaidSchema,
  requestReviewSchema,
  requestExpenseReviewSchema,
} from "./expenses.validators";
import * as repo from "./expenses.repository";
import * as requestsRepo from "./expenses.requests.repository";
import {
  buildExpenseExcelReport,
  buildExpensePdfReport,
  buildExpenseReportBundle,
} from "./expenses.reports";

function receiptFile(req: Request): Express.Multer.File | undefined {
  return req.file;
}

function validateExpenseOptions(paymentMethod: string, category: string, amount: number) {
  const settings = getExpenseSettings();
  if (!enabledPaymentMethodKeys(settings).includes(paymentMethod)) {
    throw ApiError.badRequest("Payment method is not enabled");
  }
  if (!enabledCategoryKeys(settings).includes(category)) {
    throw ApiError.badRequest("Category is not enabled");
  }
  if (amount > settings.maxAmountPerExpense) {
    throw ApiError.badRequest(`Amount exceeds the per-expense limit of ₹${settings.maxAmountPerExpense}`);
  }
  return settings;
}

async function applyAutoArchivePolicy(): Promise<void> {
  const settings = getExpenseSettings();
  if (settings.autoArchivePaidDays > 0) {
    await requestsRepo.archivePaidRequestsOlderThan(settings.autoArchivePaidDays);
  }
}

function filterMyExpenses(items: repo.ExpenseRow[], view?: string) {
  if (view === "drafts") {
    return items.filter((row) => row.status === "draft" && !row.request_id);
  }
  if (view === "pending") {
    return items.filter((row) => row.status === "pending" || row.status === "approved");
  }
  if (view === "history") {
    return items.filter((row) => row.status === "paid" || row.status === "archived" || row.status === "rejected");
  }
  return items;
}

export const listMyExpenses = asyncHandler(async (req: Request, res: Response) => {
  await applyAutoArchivePolicy();
  const query = expenseListQuerySchema.parse(req.query);
  const items = filterMyExpenses(
    await repo.listExpenses({
      employeeId: req.user!.id,
      from: query.from,
      to: query.to,
      weekStart: query.weekStart,
      status: query.status,
    }),
    query.view
  );
  const requests = await requestsRepo.listRequests({ employeeId: req.user!.id });
  res.json({ items, weeks: repo.groupExpensesByWeek(items), requests });
});

export const getExpenseOptions = asyncHandler(async (_req: Request, res: Response) => {
  const settings = getExpenseSettings();
  res.json({
    options: {
      cycles: settings.cycles,
      categories: settings.categories.filter((item) => item.enabled),
      paymentMethods: settings.paymentMethods.filter((item) => item.enabled),
      maxAmountPerExpense: settings.maxAmountPerExpense,
      maxAmountPerRequest: settings.maxAmountPerRequest,
      requireReceiptAbove: settings.requireReceiptAbove,
      approvalRequired: settings.approvalRequired,
    },
  });
});

export const listMyRequests = asyncHandler(async (req: Request, res: Response) => {
  await applyAutoArchivePolicy();
  const query = requestListQuerySchema.parse(req.query);
  const requests = await requestsRepo.listRequests({
    employeeId: req.user!.id,
    status: query.status,
    from: query.from,
    to: query.to,
  });
  res.json({ requests });
});

export const submitReimbursementRequest = asyncHandler(async (req: Request, res: Response) => {
  const input = reimbursementSubmitSchema.parse(req.body);
  const settings = getExpenseSettings();

  if (input.periodType === "weekly" && !settings.cycles.weekly) {
    throw ApiError.badRequest("Weekly reimbursement is disabled");
  }
  if (input.periodType === "monthly" && !settings.cycles.monthly) {
    throw ApiError.badRequest("Monthly reimbursement is disabled");
  }
  if (input.periodType === "custom" && !settings.cycles.custom) {
    throw ApiError.badRequest("Custom reimbursement is disabled");
  }

  const period = resolveReimbursementPeriod(input.periodType, input.from, input.to);
  const drafts = await requestsRepo.listDraftExpensesInRange(req.user!.id, period.start, period.end);
  if (drafts.length === 0) {
    throw ApiError.badRequest("No draft expenses found in the selected period");
  }

  if (settings.requireReceiptAbove > 0) {
    const missing = drafts.filter(
      (row) => Number(row.amount) >= settings.requireReceiptAbove && !row.receipt_path
    );
    if (missing.length > 0) {
      throw ApiError.badRequest(
        `Receipt required for expenses of ₹${settings.requireReceiptAbove} or more`
      );
    }
  }

  const requestedAmount = drafts.reduce((sum, row) => sum + Number(row.amount), 0);
  if (requestedAmount > settings.maxAmountPerRequest) {
    throw ApiError.badRequest(`Total exceeds the per-request limit of ₹${settings.maxAmountPerRequest}`);
  }

  const request = await requestsRepo.submitReimbursementRequest({
    employeeId: req.user!.id,
    periodType: input.periodType,
    periodStart: period.start,
    periodEnd: period.end,
    expenseIds: drafts.map((row) => row.id),
    requestedAmount,
    autoApprove: !settings.approvalRequired,
    reviewedBy: !settings.approvalRequired ? req.user!.id : null,
  });

  await logAudit(req, "expense.request_submit", "expense", request.id, {
    periodType: input.periodType,
    periodStart: period.start,
    periodEnd: period.end,
    requestedAmount,
    expenseCount: drafts.length,
    autoApproved: !settings.approvalRequired,
  });

  if (!settings.approvalRequired) {
    await logAudit(req, "expense.request_approve", "expense", request.id, {
      employeeId: request.employee_id,
      employeeCode: request.employee_code,
      requestedAmount: request.requested_amount,
      remarks: "Auto-approved (approval not required)",
      autoApproved: true,
    });
  }

  res.status(201).json({ request });
});

export const createMyExpense = asyncHandler(async (req: Request, res: Response) => {
  const input = expenseCreateSchema.parse(req.body);
  const settings = validateExpenseOptions(input.paymentMethod, input.category, input.amount);
  const file = receiptFile(req);
  if (settings.requireReceiptAbove > 0 && input.amount >= settings.requireReceiptAbove && !file) {
    throw ApiError.badRequest(`Receipt required for expenses of ₹${settings.requireReceiptAbove} or more`);
  }

  let receiptPath: string | null = null;
  if (file) {
    const saved = await storage.save(
      file.buffer,
      file.originalname,
      `expense-receipts/${req.user!.employeeCode}`
    );
    receiptPath = saved.relativePath;
  }

  const expense = await repo.createExpense({
    employeeId: req.user!.id,
    expenseDate: input.expenseDate,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    category: input.category,
    description: input.description ?? null,
    receiptPath,
  });

  await logAudit(req, "expense.create", "expense", expense.id, {
    amount: expense.amount,
    category: expense.category,
    paymentMethod: expense.payment_method,
    expenseDate: expense.expense_date,
    weekStart: expense.week_start,
  });

  res.status(201).json({ expense });
});

export const updateMyExpense = asyncHandler(async (req: Request, res: Response) => {
  const input = expenseUpdateSchema.parse(req.body);
  const existing = await repo.findExpenseById(req.params.id);
  if (!existing || existing.employee_id !== req.user!.id) {
    throw ApiError.notFound("Expense not found");
  }
  if (existing.status !== "draft" || existing.request_id) {
    throw ApiError.conflict("Only draft expenses can be edited");
  }

  const amount = input.amount ?? Number(existing.amount);
  validateExpenseOptions(
    input.paymentMethod ?? existing.payment_method,
    input.category ?? existing.category,
    amount
  );

  const file = receiptFile(req);
  const clearReceipt = String(req.body.clearReceipt ?? "") === "true";
  let receiptPath: string | undefined;
  if (file) {
    if (existing.receipt_path) await storage.remove(existing.receipt_path);
    const saved = await storage.save(
      file.buffer,
      file.originalname,
      `expense-receipts/${req.user!.employeeCode}`
    );
    receiptPath = saved.relativePath;
  } else if (clearReceipt && existing.receipt_path) {
    await storage.remove(existing.receipt_path);
  }

  const expense = await repo.updateExpense(req.params.id, req.user!.id, {
    expenseDate: input.expenseDate,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    category: input.category,
    description: input.description,
    receiptPath,
    clearReceipt: clearReceipt && !file,
  });
  if (!expense) throw ApiError.conflict("Expense could not be updated");

  await logAudit(req, "expense.update", "expense", expense.id, {
    before: { amount: existing.amount, category: existing.category, expenseDate: existing.expense_date },
    after: { amount: expense.amount, category: expense.category, expenseDate: expense.expense_date },
  });

  res.json({ expense });
});

export const deleteMyExpense = asyncHandler(async (req: Request, res: Response) => {
  const existing = await repo.findExpenseById(req.params.id);
  if (!existing || existing.employee_id !== req.user!.id) {
    throw ApiError.notFound("Expense not found");
  }
  if (existing.status !== "draft" || existing.request_id) {
    throw ApiError.conflict("Only draft expenses can be deleted");
  }

  const deleted = await repo.deleteExpense(req.params.id, req.user!.id);
  if (!deleted) throw ApiError.notFound("Expense not found");
  if (deleted.receipt_path) await storage.remove(deleted.receipt_path);

  await logAudit(req, "expense.delete", "expense", deleted.id, {
    amount: deleted.amount,
    category: deleted.category,
    expenseDate: deleted.expense_date,
  });

  res.json({ success: true });
});

export const adminListRequests = asyncHandler(async (req: Request, res: Response) => {
  await applyAutoArchivePolicy();
  const query = requestListQuerySchema.parse(req.query);
  const requests = await requestsRepo.listRequests({
    employeeId: query.employeeId,
    status: query.status,
    from: query.from,
    to: query.to,
  });
  res.json({ requests });
});

export const adminGetRequest = asyncHandler(async (req: Request, res: Response) => {
  const request = await requestsRepo.findRequestById(req.params.id);
  if (!request) throw ApiError.notFound("Reimbursement request not found");
  const expenses = await repo.listExpenses({ employeeId: request.employee_id });
  const items = expenses.filter((row) => row.request_id === request.id);
  const summary = await requestsRepo.getRequestExpenseSummary(request.id);
  res.json({ request, expenses: items, summary });
});

export const adminReviewRequestExpense = asyncHandler(async (req: Request, res: Response) => {
  const input = requestExpenseReviewSchema.parse(req.body);
  const result = await requestsRepo.reviewRequestExpense(
    req.params.requestId,
    req.params.expenseId,
    {
      status: input.status,
      remarks: input.remarks ?? null,
      reviewedBy: req.user!.id,
    }
  );
  if (!result) {
    throw ApiError.conflict("Expense is not pending review on this request");
  }

  await logAudit(
    req,
    input.status === "approved" ? "expense.approve" : "expense.reject",
    "expense",
    result.expense.id,
    {
      requestId: result.request.id,
      employeeId: result.expense.employee_id,
      employeeCode: result.expense.employee_code,
      amount: result.expense.amount,
      remarks: input.remarks ?? null,
    }
  );

  const summary = await requestsRepo.getRequestExpenseSummary(result.request.id);
  res.json({ request: result.request, expense: result.expense, summary });
});

export const adminApproveAllRemaining = asyncHandler(async (req: Request, res: Response) => {
  const request = await requestsRepo.approveAllRemainingRequestExpenses(
    req.params.id,
    req.user!.id
  );
  if (!request) {
    throw ApiError.conflict(
      "Approve all remaining requires individual review first and pending expenses"
    );
  }

  const summary = await requestsRepo.getRequestExpenseSummary(request.id);
  await logAudit(req, "expense.request_approve", "expense", request.id, {
    employeeId: request.employee_id,
    employeeCode: request.employee_code,
    approvedAmount: summary.payableAmount,
    bulkApproveRemaining: true,
  });

  res.json({ request, summary });
});

export const adminReviewRequest = asyncHandler(async (req: Request, res: Response) => {
  const input = requestReviewSchema.parse(req.body);
  const existing = await requestsRepo.findRequestById(req.params.id);
  if (!existing) throw ApiError.notFound("Reimbursement request not found");

  const request = await requestsRepo.reviewRequest(req.params.id, {
    status: input.status,
    remarks: input.remarks ?? null,
    reviewedBy: req.user!.id,
    approvedAmount: input.status === "approved" ? Number(existing.requested_amount) : null,
  });
  if (!request) throw ApiError.conflict("Request is not pending approval");

  await logAudit(
    req,
    input.status === "approved" ? "expense.request_approve" : "expense.request_reject",
    "expense",
    request.id,
    {
      employeeId: request.employee_id,
      employeeCode: request.employee_code,
      requestedAmount: request.requested_amount,
      remarks: input.remarks ?? null,
    }
  );

  res.json({ request });
});

export const adminMarkRequestPaid = asyncHandler(async (req: Request, res: Response) => {
  const input = requestPaidSchema.parse(req.body);
  const settings = getExpenseSettings();
  const existing = await requestsRepo.findRequestById(req.params.id);
  if (!existing) throw ApiError.notFound("Reimbursement request not found");

  const request = await requestsRepo.markRequestPaid(req.params.id, {
    paidBy: req.user!.id,
    notes: input.notes ?? null,
    archiveImmediately: settings.autoArchivePaidDays === 0,
  });
  if (!request) throw ApiError.conflict("Only approved requests can be marked paid");

  await logAudit(req, "expense.request_paid", "expense", request.id, {
    employeeId: request.employee_id,
    employeeCode: request.employee_code,
    paidAmount: request.approved_amount ?? request.requested_amount,
    notes: input.notes ?? null,
    archived: request.status === "archived",
  });

  res.json({ request });
});

export const adminArchiveRequest = asyncHandler(async (req: Request, res: Response) => {
  const request = await requestsRepo.archivePaidRequest(req.params.id);
  if (!request) throw ApiError.conflict("Only paid requests can be archived");

  await logAudit(req, "expense.request_archive", "expense", request.id, {
    employeeId: request.employee_id,
    employeeCode: request.employee_code,
  });

  res.json({ request });
});

/** @deprecated Legacy week payment — prefer request-based payment */
export const adminListExpenses = asyncHandler(async (req: Request, res: Response) => {
  const query = expenseListQuerySchema.parse(req.query);
  const items = await repo.listExpenses({
    employeeId: query.employeeId,
    from: query.from,
    to: query.to,
    weekStart: query.weekStart,
    status: query.status,
  });
  res.json({ items, weeks: repo.groupExpensesByWeek(items) });
});

export const adminReviewExpense = asyncHandler(async (req: Request, res: Response) => {
  const input = expenseReviewSchema.parse(req.body);
  const existing = await repo.findExpenseById(req.params.id);
  if (!existing) throw ApiError.notFound("Expense not found");

  const expense = await repo.reviewExpense(req.params.id, {
    status: input.status,
    remarks: input.remarks ?? null,
    reviewedBy: req.user!.id,
  });
  if (!expense) throw ApiError.notFound("Expense not found");

  await logAudit(
    req,
    input.status === "approved" ? "expense.approve" : "expense.reject",
    "expense",
    expense.id,
    {
      employeeId: expense.employee_id,
      employeeCode: expense.employee_code,
      amount: expense.amount,
      remarks: input.remarks ?? null,
      previousStatus: existing.status,
    }
  );

  res.json({ expense });
});

export const adminMarkWeekPaid = asyncHandler(async (req: Request, res: Response) => {
  const input = expenseWeekPaidSchema.parse(req.body);
  const weekExpenses = await repo.listExpenses({
    employeeId: input.employeeId,
    weekStart: input.weekStart,
  });
  if (weekExpenses.length === 0) {
    throw ApiError.badRequest("No expenses found for that employee and week");
  }
  const hasPending = weekExpenses.some((row) => row.status === "pending");
  if (hasPending) {
    throw ApiError.conflict("Approve or reject all pending expenses before marking the week as paid");
  }
  const hasApproved = weekExpenses.some((row) => row.status === "approved");
  if (!hasApproved) {
    throw ApiError.conflict("At least one approved expense is required to mark the week as paid");
  }

  const payment = await repo.markWeekPaid({
    employeeId: input.employeeId,
    weekStart: input.weekStart,
    paidBy: req.user!.id,
    notes: input.notes ?? null,
  });

  await logAudit(req, "expense.week_paid", "expense", payment.id, {
    employeeId: input.employeeId,
    weekStart: input.weekStart,
    expenseCount: weekExpenses.length,
    notes: input.notes ?? null,
  });

  const items = await repo.listExpenses({
    employeeId: input.employeeId,
    weekStart: input.weekStart,
  });

  res.json({ payment, weeks: repo.groupExpensesByWeek(items) });
});

export const exportExpenseReport = asyncHandler(async (req: Request, res: Response) => {
  const query = expenseExportQuerySchema.parse(req.query);

  let period: { start: string; end: string };
  try {
    period = resolveReimbursementPeriod(query.period, query.from, query.to);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid report period";
    console.error("[expense.export] Invalid period:", {
      userId: req.user?.id,
      query,
      message,
    });
    throw ApiError.badRequest(message);
  }

  const isMaster = req.user!.role === "admin";
  const employeeId = isMaster ? query.employeeId : req.user!.id;
  if (!isMaster && query.employeeId && query.employeeId !== req.user!.id) {
    throw ApiError.forbidden("You can only export your own expenses");
  }

  try {
    const items = await repo.listExpenses({
      employeeId,
      from: period.start,
      to: period.end,
    });

    const requestIds = [...new Set(items.map((row) => row.request_id).filter(Boolean))] as string[];
    const requestMap = new Map<string, requestsRepo.ReimbursementRequestRow>();
    for (const id of requestIds) {
      const request = await requestsRepo.findRequestById(id);
      if (request) requestMap.set(id, request);
    }

    const bundle = buildExpenseReportBundle(items, requestMap);
    const title = `${query.period} report (${period.start} to ${period.end})`;

    await logAudit(req, "expense.export", "expense", undefined, {
      format: query.format,
      period: query.period,
      from: period.start,
      to: period.end,
      rowCount: bundle.rows.length,
    });

    const filenameBase = `expense-report-${period.start}-${period.end}`;
    if (query.format === "excel") {
      const buffer = await buildExpenseExcelReport(bundle, title);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
      res.setHeader("Content-Length", String(buffer.length));
      res.send(buffer);
      return;
    }

    const buffer = await buildExpensePdfReport(bundle, title);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (err) {
    console.error("[expense.export] Failed to generate report:", {
      userId: req.user?.id,
      role: req.user?.role,
      format: query.format,
      period: query.period,
      from: period.start,
      to: period.end,
      employeeId: employeeId ?? null,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    });
    if (err instanceof ApiError) throw err;
    const detail = err instanceof Error ? err.message : "Unknown error";
    throw ApiError.internal(
      env.isProduction ? "Failed to generate expense report" : `Failed to generate expense report: ${detail}`
    );
  }
});

export const getReimbursementSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await requestsRepo.getPendingReimbursementTotal();
  res.json({ summary });
});
