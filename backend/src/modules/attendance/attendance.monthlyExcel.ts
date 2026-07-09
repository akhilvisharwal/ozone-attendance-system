import ExcelJS from "exceljs";
import fs from "fs";
import { formatCompanyContactLine, getCompanyName, getDocumentCreator, SYSTEM_NAME } from "../../config/branding";
import { formatMinutesAsHours } from "../../utils/date";
import { resolveCompanyLogoPath } from "../../utils/pdfBranding";
import { formatDisplayDateTime } from "../../utils/formatDisplay";
import { getSettings } from "../settings/settings.cache";
import type { MonthlyCellStatus, MonthlyGrid } from "./attendance.monthly";

export interface MonthlyExcelMeta {
  generatedBy: string;
  generatedAt?: Date;
}

interface StatusStyle {
  code: string;
  bg: string;
  fg: string;
}

const STATUS_STYLES: Record<MonthlyCellStatus, StatusStyle> = {
  present: { code: "P", bg: "FF10B981", fg: "FFFFFFFF" },
  half_day: { code: "H", bg: "FFFBBF24", fg: "FF1E293B" },
  absent: { code: "A", bg: "FFEF4444", fg: "FFFFFFFF" },
  leave: { code: "L", bg: "FF0EA5E9", fg: "FFFFFFFF" },
  weekly_off: { code: "WO", bg: "FFE2E8F0", fg: "FF475569" },
  holiday: { code: "HO", bg: "FFA855F7", fg: "FFFFFFFF" },
  holiday_worked: { code: "HW", bg: "FF0D9488", fg: "FFFFFFFF" },
  weekly_off_worked: { code: "WW", bg: "FF4F46E5", fg: "FFFFFFFF" },
  none: { code: "", bg: "FFF8FAFC", fg: "FFCBD5E1" },
};

const LEGEND_ITEMS: { code: string; label: string; bg: string; fg: string }[] = [
  { code: "P", label: "Present", bg: "FF10B981", fg: "FFFFFFFF" },
  { code: "A", label: "Absent", bg: "FFEF4444", fg: "FFFFFFFF" },
  { code: "H", label: "Half Day", bg: "FFFBBF24", fg: "FF1E293B" },
  { code: "L", label: "Leave", bg: "FF0EA5E9", fg: "FFFFFFFF" },
  { code: "WO", label: "Weekly Off", bg: "FFE2E8F0", fg: "FF475569" },
  { code: "HO", label: "Holiday", bg: "FFA855F7", fg: "FFFFFFFF" },
  { code: "HW", label: "Worked on Holiday", bg: "FF0D9488", fg: "FFFFFFFF" },
  { code: "WW", label: "Worked on Weekly Off", bg: "FF4F46E5", fg: "FFFFFFFF" },
];

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const INFO_COL_COUNT = 4;
const SUMMARY_COL_COUNT = 11;
const SUMMARY_KEYS = ["P", "H", "A", "L", "WO", "HO", "HW", "WW", "WD", "Hrs", "Att%"] as const;
const INFO_HEADERS = ["#", "Name", "ID", "Role"] as const;

const COLORS = {
  headerDark: "FF1E293B",
  headerMid: "FF334155",
  headerLight: "FFF1F5F9",
  headerWeekend: "FFE2E8F0",
  headerHoliday: "FFEDE9FE",
  border: "FFCBD5E1",
  borderLight: "FFE2E8F0",
  textDark: "FF0F172A",
  textMuted: "FF64748B",
  textLabel: "FF475569",
  rowAlt: "FFF8FAFC",
  white: "FFFFFFFF",
  holidayText: "FF6D28D9",
};

function totalColumns(daysInMonth: number): number {
  return INFO_COL_COUNT + daysInMonth + SUMMARY_COL_COUNT;
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function cellBorder(color = COLORS.borderLight): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    value?: ExcelJS.CellValue;
    bold?: boolean;
    size?: number;
    fg?: string;
    bg?: string;
    align?: Partial<ExcelJS.Alignment>;
    border?: boolean;
  }
): void {
  if (opts.value !== undefined) cell.value = opts.value;
  cell.font = {
    bold: opts.bold ?? false,
    size: opts.size ?? 9,
    color: { argb: opts.fg ?? COLORS.textDark },
  };
  if (opts.bg) cell.fill = solidFill(opts.bg);
  if (opts.align) cell.alignment = opts.align;
  if (opts.border) cell.border = cellBorder();
}

function formatGeneratedAt(date: Date): string {
  return formatDisplayDateTime(date);
}

/** Builds an HRMS-style monthly attendance register Excel workbook mirroring the PDF layout. */
export async function buildMonthlyCalendarExcel(
  grid: MonthlyGrid,
  meta: MonthlyExcelMeta
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = getDocumentCreator();
  workbook.created = meta.generatedAt ?? new Date();

  const sheet = workbook.addWorksheet("Monthly Attendance", {
    views: [{ state: "frozen", ySplit: 9, xSplit: INFO_COL_COUNT }],
  });

  const reports = getSettings().reports;
  const generatedAt = meta.generatedAt ?? new Date();
  const dateStr = formatGeneratedAt(generatedAt);
  const colCount = totalColumns(grid.daysInMonth);
  const infoEnd = INFO_COL_COUNT;
  const dayStart = infoEnd + 1;
  const dayEnd = infoEnd + grid.daysInMonth;
  const summaryStart = dayEnd + 1;
  const summaryEnd = colCount;

  sheet.columns = [
    { width: 4 },
    { width: 22 },
    { width: 10 },
    { width: 12 },
    ...Array.from({ length: grid.daysInMonth }, () => ({ width: 3.8 })),
    { width: 4.5 },
    { width: 4.5 },
    { width: 4.5 },
    { width: 4.5 },
    { width: 5 },
    { width: 4.5 },
    { width: 5 },
    { width: 5.5 },
    { width: 8 },
    { width: 7 },
  ];

  if (reports.includeLogo) {
    const logoPath = resolveCompanyLogoPath();
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const ext = logoPath.toLowerCase().endsWith(".jpg") || logoPath.toLowerCase().endsWith(".jpeg")
          ? "jpeg"
          : "png";
        const imageId = workbook.addImage({ filename: logoPath, extension: ext as "png" | "jpeg" });
        sheet.addImage(imageId, {
          tl: { col: 0, row: 0 },
          ext: { width: 124, height: 30 },
        });
      } catch {
        /* logo optional */
      }
    }
  }

  sheet.getRow(1).height = 34;
  sheet.mergeCells(1, 1, 1, colCount);
  styleCell(sheet.getCell(1, 1), {
    value: "Monthly Attendance Register",
    bold: true,
    size: 14,
    fg: COLORS.textDark,
    align: { horizontal: "center", vertical: "middle" },
  });

  sheet.mergeCells(2, 1, 2, colCount);
  styleCell(sheet.getCell(2, 1), {
    value: grid.label,
    bold: true,
    size: 12,
    fg: COLORS.headerMid,
    align: { horizontal: "center", vertical: "middle" },
  });

  sheet.mergeCells(3, 1, 3, Math.max(1, colCount - 4));
  styleCell(sheet.getCell(3, 1), {
    value: "",
    size: 8,
  });

  const metaStart = Math.max(summaryEnd - 3, infoEnd + 1);
  sheet.mergeCells(3, metaStart, 3, colCount);
  styleCell(sheet.getCell(3, metaStart), {
    value: `Generated: ${dateStr}   ·   Prepared by: ${meta.generatedBy}`,
    size: 8,
    fg: COLORS.textMuted,
    align: { horizontal: "right", vertical: "middle", wrapText: true },
  });

  sheet.getRow(4).height = 6;

  const legendRow = 5;
  sheet.getCell(legendRow, 1).value = "Legend:";
  styleCell(sheet.getCell(legendRow, 1), { bold: true, size: 8, fg: COLORS.textLabel });

  let legendCol = 2;
  for (const item of LEGEND_ITEMS) {
    const codeCell = sheet.getCell(legendRow, legendCol);
    styleCell(codeCell, {
      value: item.code,
      bold: true,
      size: 7,
      fg: item.fg,
      bg: item.bg,
      align: { horizontal: "center", vertical: "middle" },
      border: true,
    });
    const labelCell = sheet.getCell(legendRow, legendCol + 1);
    styleCell(labelCell, {
      value: item.label,
      size: 8,
      fg: COLORS.textLabel,
      align: { vertical: "middle" },
    });
    legendCol += 2;
  }

  const holidayRow = 6;
  if (grid.holidays.length) {
    sheet.getCell(holidayRow, 1).value = "Holidays:";
    styleCell(sheet.getCell(holidayRow, 1), { bold: true, size: 8, fg: COLORS.textLabel });
    sheet.mergeCells(holidayRow, 2, holidayRow, colCount);
    const holidayText = grid.holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join("  ·  ");
    styleCell(sheet.getCell(holidayRow, 2), {
      value: holidayText,
      size: 8,
      fg: COLORS.textMuted,
      align: { vertical: "middle", wrapText: true },
    });
    sheet.getRow(holidayRow).height = grid.holidays.length > 4 ? 28 : 18;
  }

  const headerRow1 = 8;
  const headerRow2 = 9;

  sheet.mergeCells(headerRow1, 1, headerRow1, infoEnd);
  styleCell(sheet.getCell(headerRow1, 1), {
    value: "Employee Details",
    bold: true,
    size: 9,
    fg: COLORS.white,
    bg: COLORS.headerDark,
    align: { horizontal: "center", vertical: "middle" },
    border: true,
  });

  sheet.mergeCells(headerRow1, dayStart, headerRow1, dayEnd);
  styleCell(sheet.getCell(headerRow1, dayStart), {
    value: "Daily Attendance",
    bold: true,
    size: 9,
    fg: COLORS.white,
    bg: COLORS.headerMid,
    align: { horizontal: "center", vertical: "middle" },
    border: true,
  });

  sheet.mergeCells(headerRow1, summaryStart, headerRow1, summaryEnd);
  styleCell(sheet.getCell(headerRow1, summaryStart), {
    value: "Monthly Summary",
    bold: true,
    size: 9,
    fg: COLORS.white,
    bg: COLORS.headerDark,
    align: { horizontal: "center", vertical: "middle" },
    border: true,
  });

  for (let c = 1; c <= infoEnd; c++) {
    styleCell(sheet.getCell(headerRow2, c), {
      value: INFO_HEADERS[c - 1],
      bold: true,
      size: 8,
      fg: COLORS.headerMid,
      bg: COLORS.headerLight,
      align: { horizontal: "center", vertical: "middle" },
      border: true,
    });
  }

  for (let d = 1; d <= grid.daysInMonth; d++) {
    const col = dayStart + d - 1;
    const dateStrDay = `${grid.year}-${String(grid.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wd = new Date(grid.year, grid.month - 1, d).getDay();
    const weeklyOffColumn = grid.defaultWeeklyOffDays.includes(wd);
    const holiday = grid.holidays.find((h) => h.date === dateStrDay);
    const cell = sheet.getCell(headerRow2, col);
    cell.value = holiday ? `${d}\n${holiday.name.slice(0, 6)}` : `${d}\n${WEEKDAY_LETTERS[wd]}`;
    styleCell(cell, {
      bold: true,
      size: 7,
      fg: holiday ? COLORS.holidayText : COLORS.headerMid,
      bg: holiday ? COLORS.headerHoliday : weeklyOffColumn ? COLORS.headerWeekend : COLORS.headerLight,
      align: { horizontal: "center", vertical: "middle", wrapText: true },
      border: true,
    });
  }

  for (let i = 0; i < SUMMARY_COL_COUNT; i++) {
    styleCell(sheet.getCell(headerRow2, summaryStart + i), {
      value: SUMMARY_KEYS[i],
      bold: true,
      size: 7,
      fg: COLORS.headerMid,
      bg: COLORS.headerLight,
      align: { horizontal: "center", vertical: "middle" },
      border: true,
    });
  }

  sheet.getRow(headerRow1).height = 20;
  sheet.getRow(headerRow2).height = 26;

  let dataRow = headerRow2 + 1;

  if (grid.employees.length === 0) {
    sheet.mergeCells(dataRow, 1, dataRow, colCount);
    styleCell(sheet.getCell(dataRow, 1), {
      value: "No employee attendance data for this period.",
      size: 10,
      fg: COLORS.textMuted,
      align: { horizontal: "center", vertical: "middle" },
    });
    dataRow += 1;
  } else {
    grid.employees.forEach((emp, index) => {
      const row = sheet.getRow(dataRow);
      row.height = 16;
      const rowBg = index % 2 === 0 ? COLORS.white : COLORS.rowAlt;

      styleCell(row.getCell(1), {
        value: index + 1,
        size: 8,
        align: { horizontal: "center", vertical: "middle" },
        bg: rowBg,
        border: true,
      });
      styleCell(row.getCell(2), {
        value: emp.name,
        size: 8,
        align: { horizontal: "left", vertical: "middle" },
        bg: rowBg,
        border: true,
      });
      styleCell(row.getCell(3), {
        value: emp.employeeCode,
        size: 8,
        align: { horizontal: "center", vertical: "middle" },
        bg: rowBg,
        border: true,
      });
      styleCell(row.getCell(4), {
        value: emp.designation ?? emp.department ?? "-",
        size: 8,
        align: { horizontal: "center", vertical: "middle" },
        bg: rowBg,
        border: true,
      });

      for (const day of emp.days) {
        const col = dayStart + day.day - 1;
        const style = STATUS_STYLES[day.status];
        styleCell(row.getCell(col), {
          value: style.code,
          bold: Boolean(style.code),
          size: 7,
          fg: style.fg,
          bg: style.bg,
          align: { horizontal: "center", vertical: "middle" },
          border: true,
        });
      }

      const s = emp.summary;
      const summaryValues = [
        s.present,
        s.halfDay,
        s.absent,
        s.leave,
        s.weeklyOff,
        s.holidays,
        s.holidayWorked,
        s.weeklyOffWorked,
        s.workingDays,
        formatMinutesAsHours(s.totalMinutes).replace(" ", ""),
        `${s.attendancePercentage}%`,
      ];

      for (let i = 0; i < SUMMARY_COL_COUNT; i++) {
        styleCell(row.getCell(summaryStart + i), {
          value: summaryValues[i],
          bold: true,
          size: 7,
          align: { horizontal: "center", vertical: "middle" },
          bg: rowBg,
          border: true,
        });
      }

      dataRow += 1;
    });
  }

  const footerRow = dataRow + 1;
  sheet.mergeCells(footerRow, 1, footerRow, colCount);
  const footerParts = [
    getCompanyName(),
    SYSTEM_NAME,
    "Monthly Attendance Register",
    grid.label,
  ];
  const contactLine = formatCompanyContactLine();
  if (contactLine) footerParts.push(contactLine);
  if (reports.signatureText?.trim()) {
    footerParts.push(reports.signatureText.trim());
  }
  styleCell(sheet.getCell(footerRow, 1), {
    value: footerParts.join(" · "),
    size: 8,
    fg: COLORS.textMuted,
    align: { horizontal: "left", vertical: "middle", wrapText: true },
  });
  sheet.getRow(footerRow).height = 18;

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${headerRow1}:${headerRow2}`,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };

  sheet.headerFooter = {
    oddFooter: reports.autoPageNumbers
      ? `&L${getCompanyName()}&RPage &P of &N`
      : `&L${getCompanyName()}`,
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
