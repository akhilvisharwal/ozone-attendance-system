import ExcelJS from "exceljs";
import { getCompanyName, getDocumentCreator } from "../../config/branding";
import { formatDisplayDateTime } from "../../utils/formatDisplay";
import type { ReadableReportBundle, ReportSection } from "./settings.backupReport.types";

function scopeTitle(scope: ReadableReportBundle["scope"]): string {
  if (scope === "employees") return "Employees Report";
  if (scope === "attendance") return "Attendance Report";
  return "Data Export Report";
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, "").slice(0, 31);
}

function addSectionSheet(workbook: ExcelJS.Workbook, reportSection: ReportSection, exportedAt: string): void {
  const sheet = workbook.addWorksheet(sanitizeSheetName(reportSection.title));
  const colCount = Math.max(reportSection.columns.length, 1);

  sheet.mergeCells(1, 1, 1, colCount);
  sheet.getCell(1, 1).value = `${getCompanyName()} — ${reportSection.title}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.mergeCells(2, 1, 2, colCount);
  sheet.getCell(2, 1).value = `Exported: ${formatDisplayDateTime(exportedAt)} · ${reportSection.recordCount} records`;
  sheet.getCell(2, 1).font = { size: 10, color: { argb: "FF64748B" } };

  const headerRowIndex = 4;
  sheet.getRow(headerRowIndex).values = reportSection.columns.map((col) => col.label);
  sheet.getRow(headerRowIndex).font = { bold: true };
  sheet.getRow(headerRowIndex).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" },
  };

  sheet.columns = reportSection.columns.map((col) => ({
    key: col.key,
    width: Math.max(12, Math.round(col.width / 7)),
  }));

  for (const row of reportSection.rows) {
    sheet.addRow(reportSection.columns.reduce<Record<string, string>>((acc, col) => {
      acc[col.key] = row[col.key] ?? "-";
      return acc;
    }, {}));
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowIndex }];
}

export async function buildReadableReportExcel(bundle: ReadableReportBundle): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = getDocumentCreator();
  workbook.created = new Date(bundle.exportedAt);

  const summary = workbook.addWorksheet("Summary");
  summary.getCell(1, 1).value = `${getCompanyName()} — ${scopeTitle(bundle.scope)}`;
  summary.getCell(1, 1).font = { bold: true, size: 14 };
  summary.getCell(2, 1).value = `Exported: ${formatDisplayDateTime(bundle.exportedAt)}`;
  summary.getCell(4, 1).value = "Section";
  summary.getCell(4, 2).value = "Records";
  summary.getRow(4).font = { bold: true };
  let rowIdx = 5;
  for (const sec of bundle.sections) {
    summary.getCell(rowIdx, 1).value = sec.title;
    summary.getCell(rowIdx, 2).value = sec.recordCount;
    rowIdx += 1;
  }
  summary.columns = [{ width: 24 }, { width: 12 }];

  for (const reportSection of bundle.sections) {
    addSectionSheet(workbook, reportSection, bundle.exportedAt);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
