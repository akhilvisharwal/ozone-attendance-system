import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { toDateString, formatMinutesAsHours } from "../../utils/date";
import { getCompanyName, getDocumentCreator } from "../../config/branding";
import { drawPdfReportHeader } from "../../utils/pdfBranding";
import { getSettings } from "../settings/settings.cache";

export interface ReportRow {
  employee_code: string;
  employee_name: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_minutes: number | null;
  day_status: string | null;
  site_name: string | null;
  work_status: string | null;
  work_summary: string | null;
  check_in_address: string | null;
  remarks: string | null;
}

const DAY_STATUS_LABEL: Record<string, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
};

export function dayStatusLabel(value: string | null): string {
  return value ? DAY_STATUS_LABEL[value] ?? value : "-";
}

export function resolveDateRange(period: string, from?: string, to?: string): { from: string; to: string } {
  const today = new Date();

  if (period === "daily") {
    const d = toDateString(today);
    return { from: d, to: d };
  }

  if (period === "weekly") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toDateString(start), to: toDateString(today) };
  }

  if (period === "monthly") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateString(start), to: toDateString(today) };
  }

  return {
    from: from ?? toDateString(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: to ?? toDateString(today),
  };
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

export async function buildExcelReport(rows: ReportRow[], title: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = getDocumentCreator();
  const sheet = workbook.addWorksheet("Attendance Report");

  const colCount = 12;
  sheet.mergeCells(1, 1, 1, colCount);
  sheet.getCell(1, 1).value = `${getCompanyName()} — Attendance Report`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, colCount);
  sheet.getCell(2, 1).value = title;
  sheet.getCell(2, 1).font = { bold: true, size: 11 };

  sheet.columns = [
    { header: "Employee ID", key: "employee_code", width: 14 },
    { header: "Employee Name", key: "employee_name", width: 24 },
    { header: "Date", key: "attendance_date", width: 14 },
    { header: "Check-in", key: "check_in_time", width: 20 },
    { header: "Check-out", key: "check_out_time", width: 20 },
    { header: "Working Hours", key: "working_hours", width: 16 },
    { header: "Attendance", key: "day_status", width: 14 },
    { header: "Project/Site", key: "site_name", width: 20 },
    { header: "Work Status", key: "work_status", width: 16 },
    { header: "Work Summary", key: "work_summary", width: 40 },
    { header: "Check-in Address", key: "check_in_address", width: 40 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];
  sheet.getRow(3).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      employee_code: row.employee_code,
      employee_name: row.employee_name,
      attendance_date: row.attendance_date,
      check_in_time: formatTime(row.check_in_time),
      check_out_time: formatTime(row.check_out_time),
      working_hours: formatMinutesAsHours(row.total_minutes),
      day_status: dayStatusLabel(row.day_status),
      site_name: row.site_name ?? "-",
      work_status: row.work_status ?? "-",
      work_summary: row.work_summary ?? "-",
      check_in_address: row.check_in_address ?? "-",
      remarks: row.remarks ?? "-",
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function buildPdfReport(rows: ReportRow[], title: string): Promise<Buffer> {
  const reports = getSettings().reports;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = doc.page.margins.left;
    let y = drawPdfReportHeader(doc, {
      margin,
      pageWidth: doc.page.width,
      title: "Attendance Report",
      subtitle: title,
      includeLogo: reports.includeLogo,
      signatureText: reports.signatureText,
    });

    const columns = [
      { key: "employee_code", label: "ID", width: 55 },
      { key: "employee_name", label: "Name", width: 110 },
      { key: "attendance_date", label: "Date", width: 65 },
      { key: "check_in_time", label: "Check-in", width: 100 },
      { key: "check_out_time", label: "Check-out", width: 100 },
      { key: "working_hours", label: "Hours", width: 55 },
      { key: "day_status", label: "Attendance", width: 65 },
      { key: "site_name", label: "Site", width: 85 },
      { key: "work_status", label: "Status", width: 65 },
      { key: "remarks", label: "Remarks", width: 110 },
    ];

    const startX = doc.page.margins.left;

    function drawHeader() {
      let x = startX;
      doc.font("Helvetica-Bold").fontSize(9);
      for (const col of columns) {
        doc.text(col.label, x, y, { width: col.width, ellipsis: true });
        x += col.width;
      }
      y += 16;
      doc.moveTo(startX, y).lineTo(x, y).strokeColor("#ccc").stroke();
      y += 4;
      doc.font("Helvetica").fontSize(8);
    }

    drawHeader();

    for (const row of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
        y = drawPdfReportHeader(doc, {
          margin: doc.page.margins.left,
          pageWidth: doc.page.width,
          title: "Attendance Report",
          subtitle: title,
          includeLogo: reports.includeLogo,
          signatureText: reports.signatureText,
        });
        drawHeader();
      }

      let x = startX;
      const values: Record<string, string> = {
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        attendance_date: row.attendance_date,
        check_in_time: formatTime(row.check_in_time),
        check_out_time: formatTime(row.check_out_time),
        working_hours: formatMinutesAsHours(row.total_minutes),
        day_status: dayStatusLabel(row.day_status),
        site_name: row.site_name ?? "-",
        work_status: row.work_status ?? "-",
        remarks: (row.remarks ?? row.work_summary ?? "-").slice(0, 60),
      };

      for (const col of columns) {
        doc.text(values[col.key] ?? "-", x, y, { width: col.width, ellipsis: true });
        x += col.width;
      }
      y += 14;
    }

    doc.end();
  });
}
