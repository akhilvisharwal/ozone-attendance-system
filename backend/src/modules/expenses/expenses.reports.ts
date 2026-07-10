import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getCompanyName, getDocumentCreator } from "../../config/branding";
import { getSettings } from "../settings/settings.cache";
import { drawPdfReportHeader } from "../../utils/pdfBranding";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayTime,
} from "../../utils/formatDisplay";
import type { ExpenseRow } from "./expenses.repository";
import type { ReimbursementRequestRow } from "./expenses.requests.repository";
import { getExpenseSettings } from "./expenseSettings";

export interface ExpenseReportRow {
  expense_date: string;
  expense_time: string;
  employee_code: string;
  employee_name: string;
  category: string;
  payment_method: string;
  description: string;
  amount: number;
  status: string;
  approver: string;
  review_date_time: string;
  rejection_reason: string;
  payment_date: string;
  receipt_available: string;
}

export interface ExpenseReportSummary {
  totalTransactions: number;
  totalRequested: number;
  totalApproved: number;
  totalRejected: number;
  totalPaid: number;
  totalPending: number;
}

export interface ExpenseReportBundle {
  rows: ExpenseReportRow[];
  summary: ExpenseReportSummary;
}

const REPORT_COLUMNS: { key: keyof ExpenseReportRow; label: string; width: number }[] = [
  { key: "expense_date", label: "Date", width: 52 },
  { key: "expense_time", label: "Time", width: 42 },
  { key: "employee_name", label: "Employee / Junior Admin", width: 88 },
  { key: "category", label: "Category", width: 58 },
  { key: "payment_method", label: "Payment Method", width: 62 },
  { key: "description", label: "Description", width: 90 },
  { key: "amount", label: "Amount", width: 58 },
  { key: "status", label: "Status", width: 48 },
  { key: "approver", label: "Approver", width: 62 },
  { key: "review_date_time", label: "Approval / Rejection Date & Time", width: 88 },
  { key: "rejection_reason", label: "Rejection Reason", width: 82 },
  { key: "payment_date", label: "Payment Date", width: 62 },
  { key: "receipt_available", label: "Receipt Available", width: 42 },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelFor(
  map: Map<string, string>,
  key: string,
  fallback: string = key
): string {
  return map.get(key) ?? fallback;
}

function buildLabelMaps(): {
  categories: Map<string, string>;
  paymentMethods: Map<string, string>;
} {
  const settings = getExpenseSettings();
  return {
    categories: new Map(settings.categories.map((item) => [item.key, item.label])),
    paymentMethods: new Map(settings.paymentMethods.map((item) => [item.key, item.label])),
  };
}

function paymentDateFor(row: ExpenseRow): string | null {
  if (row.status !== "paid" && row.status !== "archived") return null;
  return row.week_paid_at ?? null;
}

function mapExpenseToReportRow(
  row: ExpenseRow,
  labels: { categories: Map<string, string>; paymentMethods: Map<string, string> }
): ExpenseReportRow {
  const isRejected = row.status === "rejected";
  const paymentAt = paymentDateFor(row);

  return {
    expense_date: formatDisplayDate(row.expense_date),
    expense_time: formatDisplayTime(row.created_at),
    employee_code: row.employee_code ?? "",
    employee_name: row.employee_name
      ? `${row.employee_name}${row.employee_code ? ` (${row.employee_code})` : ""}`
      : row.employee_code || "-",
    category: labelFor(labels.categories, row.category, row.category),
    payment_method: labelFor(labels.paymentMethods, row.payment_method, row.payment_method),
    description: row.description?.trim() || "-",
    amount: Number(row.amount) || 0,
    status: formatStatus(row.status),
    approver: row.reviewed_by_name?.trim() || "-",
    review_date_time: row.reviewed_at ? formatDisplayDateTime(row.reviewed_at) : "-",
    rejection_reason: isRejected ? row.admin_remarks?.trim() || "-" : "-",
    payment_date: paymentAt ? formatDisplayDateTime(paymentAt) : "-",
    receipt_available: row.receipt_path ? "Yes" : "No",
  };
}

export function buildExpenseReportSummary(expenses: ExpenseRow[]): ExpenseReportSummary {
  let totalRequested = 0;
  let totalApproved = 0;
  let totalRejected = 0;
  let totalPaid = 0;
  let totalPending = 0;

  for (const row of expenses) {
    const amount = Number(row.amount);
    totalRequested += amount;

    if (row.status === "approved") totalApproved += amount;
    else if (row.status === "rejected") totalRejected += amount;
    else if (row.status === "paid" || row.status === "archived") totalPaid += amount;
    else if (row.status === "pending" || row.status === "draft") totalPending += amount;
  }

  return {
    totalTransactions: expenses.length,
    totalRequested,
    totalApproved,
    totalRejected,
    totalPaid,
    totalPending,
  };
}

function compareExpenseRows(a: ExpenseRow, b: ExpenseRow): number {
  const dateCmp = String(a.expense_date).localeCompare(String(b.expense_date));
  if (dateCmp !== 0) return dateCmp;
  return String(a.created_at).localeCompare(String(b.created_at));
}

export function buildExpenseReportRows(
  expenses: ExpenseRow[],
  _requests?: Map<string, ReimbursementRequestRow>
): ExpenseReportRow[] {
  const labels = buildLabelMaps();
  const sorted = [...expenses].sort(compareExpenseRows);
  return sorted.map((row) => mapExpenseToReportRow(row, labels));
}

export function buildExpenseReportBundle(
  expenses: ExpenseRow[],
  requests?: Map<string, ReimbursementRequestRow>
): ExpenseReportBundle {
  return {
    rows: buildExpenseReportRows(expenses, requests),
    summary: buildExpenseReportSummary(expenses),
  };
}

function summaryEntries(summary: ExpenseReportSummary): [string, string | number][] {
  return [
    ["Total Transactions", summary.totalTransactions],
    ["Total Requested", formatMoney(summary.totalRequested)],
    ["Total Approved", formatMoney(summary.totalApproved)],
    ["Total Rejected", formatMoney(summary.totalRejected)],
    ["Total Paid", formatMoney(summary.totalPaid)],
    ["Total Pending", formatMoney(summary.totalPending)],
  ];
}

function addExcelSummaryBlock(
  sheet: ExcelJS.Worksheet,
  summary: ExpenseReportSummary,
  startRow: number
): number {
  sheet.getCell(startRow, 1).value = "Summary";
  sheet.getCell(startRow, 1).font = { bold: true, size: 11 };
  let row = startRow + 1;

  for (const [label, value] of summaryEntries(summary)) {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { bold: true };
    sheet.getCell(row, 2).value = value;
    row += 1;
  }

  return row + 1;
}

export async function buildExpenseExcelReport(
  bundle: ExpenseReportBundle,
  title: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = getDocumentCreator();
  const sheet = workbook.addWorksheet("Expense Report");
  const colCount = REPORT_COLUMNS.length;

  sheet.mergeCells(1, 1, 1, colCount);
  sheet.getCell(1, 1).value = `${getCompanyName()} — Expense Report`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.mergeCells(2, 1, 2, colCount);
  sheet.getCell(2, 1).value = title;
  sheet.getCell(2, 1).font = { size: 10, color: { argb: "FF64748B" } };

  const headerRowIndex = addExcelSummaryBlock(sheet, bundle.summary, 4);
  REPORT_COLUMNS.forEach((col, index) => {
    const cell = sheet.getCell(headerRowIndex, index + 1);
    cell.value = col.label;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  sheet.columns = REPORT_COLUMNS.map((col) => ({
    key: col.key,
    width: Math.max(12, Math.round(col.width / 6.5)),
  }));

  for (const row of bundle.rows) {
    const added = sheet.addRow(
      REPORT_COLUMNS.map((col) => {
        const value = row[col.key];
        return col.key === "amount" ? value : String(value ?? "-");
      })
    );
    added.getCell(7).numFmt = '"₹"#,##0.00';
    added.alignment = { vertical: "top", wrapText: true };
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowIndex }];
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: colCount },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function drawPdfPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - doc.page.margins.bottom + 6;
    doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(
      `Page ${i + 1} of ${range.count}`,
      doc.page.margins.left,
      footerY,
      {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "center",
      }
    );
  }
  doc.fillColor("#000000");
}

export async function buildExpensePdfReport(
  bundle: ExpenseReportBundle,
  title: string
): Promise<Buffer> {
  const reports = getSettings().reports;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 36,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
      info: {
        Title: `${getCompanyName()} — Expense Report`,
        Author: getDocumentCreator(),
        Subject: "Expense Report",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = doc.page.margins.left;
    const pageBottom = doc.page.height - doc.page.margins.bottom - 28;
    const rowHeight = 13;

    let y = drawPdfReportHeader(doc, {
      margin,
      pageWidth: doc.page.width,
      title: "Expense Report",
      subtitle: title,
      includeLogo: reports.includeLogo,
      signatureText: reports.signatureText,
    });

    function ensureSpace(needed: number): void {
      if (y + needed <= pageBottom) return;
      doc.addPage({ margin: 36, size: "A4", layout: "landscape" });
      y = drawPdfReportHeader(doc, {
        margin: doc.page.margins.left,
        pageWidth: doc.page.width,
        title: "Expense Report",
        subtitle: title,
        includeLogo: reports.includeLogo,
        signatureText: reports.signatureText,
      });
    }

    y += 4;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("Summary", margin, y);
    y += 14;

    const summaryCols = 3;
    const summaryBoxWidth =
      (doc.page.width - margin * 2 - (summaryCols - 1) * 12) / summaryCols;
    const summaryItems = summaryEntries(bundle.summary);
    for (let i = 0; i < summaryItems.length; i += summaryCols) {
      let x = margin;
      for (let j = 0; j < summaryCols && i + j < summaryItems.length; j++) {
        const [label, value] = summaryItems[i + j];
        doc.roundedRect(x, y, summaryBoxWidth, 34, 4).fillAndStroke("#f8fafc", "#e2e8f0");
        doc.fillColor("#64748b").font("Helvetica").fontSize(7.5).text(label, x + 8, y + 6, {
          width: summaryBoxWidth - 16,
        });
        doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(String(value), x + 8, y + 18, {
          width: summaryBoxWidth - 16,
        });
        x += summaryBoxWidth + 12;
      }
      y += 42;
    }

    y += 6;
    ensureSpace(40);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(
      `Transactions (${bundle.summary.totalTransactions})`,
      margin,
      y
    );
    y += 16;

    function drawTableHeader(): void {
      ensureSpace(rowHeight + 8);
      let x = margin;
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a");
      for (const col of REPORT_COLUMNS) {
        doc.text(col.label, x, y, { width: col.width, lineBreak: false });
        x += col.width;
      }
      y += rowHeight;
      doc.moveTo(margin, y).lineTo(x, y).strokeColor("#cbd5e1").stroke();
      y += 4;
      doc.font("Helvetica").fontSize(6.8).fillColor("#000000");
    }

    if (bundle.rows.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("No transactions in this period.", margin, y);
    } else {
      drawTableHeader();
      for (const row of bundle.rows) {
        ensureSpace(rowHeight + 2);
        let x = margin;
        for (const col of REPORT_COLUMNS) {
          const text =
            col.key === "amount" ? formatMoney(row.amount) : String(row[col.key] ?? "-");
          doc.text(text, x, y, { width: col.width, ellipsis: true, lineBreak: false });
          x += col.width;
        }
        y += rowHeight;
      }
    }

    drawPdfPageNumbers(doc);
    doc.end();
  });
}
