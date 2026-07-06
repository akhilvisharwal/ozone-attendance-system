import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/errors";
import * as repo from "./leaves.repository";
import { buildCreateLeaveSchema, reviewLeaveSchema, adminListLeavesQuerySchema, myLeavesQuerySchema } from "./leaves.validators";
import { logAudit } from "../audit/audit.repository";
import { getSettings } from "../settings/settings.cache";
import { getLeaveLimitForCategory } from "../../utils/settingsHelpers";
import { notifyLeaveReviewed, notifyLeaveSubmitted } from "../../services/notifications.service";

export const submitLeave = asyncHandler(async (req: Request, res: Response) => {
  const input = buildCreateLeaveSchema().parse(req.body);
  const employeeId = req.user!.id;
  const leaveSettings = getSettings().leave;

  if (input.leaveType === "half" && !leaveSettings.halfDayAllowed) {
    throw ApiError.badRequest("Half-day leave is not enabled");
  }

  const existing = await repo.findLeaveByEmployeeAndDate(employeeId, input.leaveDate);
  if (existing) {
    throw ApiError.conflict("A leave request for this date already exists");
  }

  const year = new Date(input.leaveDate).getFullYear();
  const used = await repo.countApprovedLeaveDays(employeeId, input.leaveCategory, year);
  const increment = input.leaveType === "half" ? 0.5 : 1;
  const limit = getLeaveLimitForCategory(input.leaveCategory);
  if (used + increment > limit) {
    throw ApiError.badRequest(
      `Leave limit exceeded for ${input.leaveCategory}. Used ${used}/${limit} days this year.`
    );
  }

  const initialStatus = leaveSettings.approvalRequired ? ("pending" as const) : ("approved" as const);

  const leave = await repo.createLeaveRequest({
    employeeId,
    leaveDate: input.leaveDate,
    leaveType: input.leaveType,
    leaveCategory: input.leaveCategory,
    reason: input.reason,
    status: initialStatus,
  });

  await logAudit(req, "leave.submit", "leave_requests", leave.id, {
    leaveCategory: input.leaveCategory,
    autoApproved: !leaveSettings.approvalRequired,
  });

  notifyLeaveSubmitted({
    employeeName: req.user!.employeeCode,
    leaveDate: input.leaveDate,
    category: input.leaveCategory,
  });

  res.status(201).json({ leave });
});

export const myLeaves = asyncHandler(async (req: Request, res: Response) => {
  const query = myLeavesQuerySchema.parse(req.query);
  const { items, total } = await repo.listMyLeaveRequests(req.user!.id, query);
  const leaveSettings = getSettings().leave;
  res.json({
    items,
    total,
    page: query.page,
    limit: query.limit,
    limits: {
      annual: leaveSettings.annualLimit,
      sick: leaveSettings.sickLimit,
      casual: leaveSettings.casualLimit,
      leaveTypes: leaveSettings.leaveTypes,
    },
  });
});

export const cancelLeave = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await repo.deleteMyLeaveRequest(req.params.id, req.user!.id);
  if (!deleted) {
    throw ApiError.notFound(
      "Leave request not found, already reviewed, or you do not own it"
    );
  }
  await logAudit(req, "leave.cancel", "leave_requests", req.params.id);
  res.json({ message: "Leave request cancelled" });
});

export const adminListLeaves = asyncHandler(async (req: Request, res: Response) => {
  const query = adminListLeavesQuerySchema.parse(req.query);
  const { items, total } = await repo.adminListLeaveRequests(query);
  res.json({ items, total, page: query.page, limit: query.limit });
});

export const adminGetLeave = asyncHandler(async (req: Request, res: Response) => {
  const leave = await repo.findLeaveById(req.params.id);
  if (!leave) throw ApiError.notFound("Leave request not found");
  res.json({ leave });
});

export const adminReviewLeave = asyncHandler(async (req: Request, res: Response) => {
  const input = reviewLeaveSchema.parse(req.body);
  const leave = await repo.findLeaveById(req.params.id);
  if (!leave) throw ApiError.notFound("Leave request not found");

  if (leave.status !== "pending") {
    throw ApiError.conflict("This leave request has already been reviewed");
  }

  if (input.status === "approved") {
    const year = new Date(leave.leave_date).getFullYear();
    const used = await repo.countApprovedLeaveDays(leave.employee_id, leave.leave_category, year);
    const increment = leave.leave_type === "half" ? 0.5 : 1;
    const limit = getLeaveLimitForCategory(leave.leave_category);
    if (used + increment > limit) {
      throw ApiError.badRequest(
        `Cannot approve: ${leave.leave_category} limit (${limit} days) would be exceeded.`
      );
    }
  }

  const updated = await repo.reviewLeaveRequest({
    id: req.params.id,
    status: input.status,
    reviewedBy: req.user!.id,
    reviewNote: input.reviewNote ?? null,
  });

  await logAudit(req, `leave.${input.status}`, "leave_requests", updated.id);

  notifyLeaveReviewed({
    employeeName: leave.employee_code,
    status: input.status,
    leaveDate: leave.leave_date,
  });

  res.json({ leave: updated });
});
