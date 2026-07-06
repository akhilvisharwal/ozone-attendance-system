import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { exportReportQuerySchema, viewReportQuerySchema } from "./reports.validators";
import { resolveDateRange, buildExcelReport, buildPdfReport } from "./reports.service";
import { fetchReportRows } from "./reports.repository";
import { logAudit } from "../audit/audit.repository";
import { formatMinutesAsHours } from "../../utils/date";

/** Returns report rows as JSON for in-browser viewing — no download. */
export const viewReport = asyncHandler(async (req: Request, res: Response) => {
  const query = viewReportQuerySchema.parse(req.query);
  const { from, to } = resolveDateRange(query.period, query.from, query.to);
  const rows = await fetchReportRows({ from, to, employeeId: query.employeeId });

  const enriched = rows.map((r) => ({
    ...r,
    working_hours: formatMinutesAsHours(r.total_minutes),
    check_in_time: r.check_in_time ? new Date(r.check_in_time).toLocaleString("en-IN") : null,
    check_out_time: r.check_out_time ? new Date(r.check_out_time).toLocaleString("en-IN") : null,
  }));

  res.json({ rows: enriched, from, to, total: enriched.length });
});

import { getSettings } from "../settings/settings.cache";

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const query = exportReportQuerySchema.parse(req.query);
  const format = query.format ?? getSettings().reports.defaultFormat;
  const { from, to } = resolveDateRange(query.period, query.from, query.to);

  const rows = await fetchReportRows({ from, to, employeeId: query.employeeId });

  await logAudit(req, "report.export", undefined, undefined, { format, from, to });

  const filenameBase = `attendance-report-${from}-to-${to}`;

  if (format === "excel") {
    const buffer = await buildExcelReport(rows, `${from} to ${to}`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
    res.send(buffer);
    return;
  }

  const buffer = await buildPdfReport(rows, `${from} to ${to}`);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
  res.send(buffer);
});
