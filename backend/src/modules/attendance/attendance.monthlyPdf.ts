import PDFDocument from "pdfkit";
import { getCompanyName, SYSTEM_NAME } from "../../config/branding";
import { drawPdfLogo } from "../../utils/pdfBranding";
import { getSettings } from "../settings/settings.cache";
import { formatMinutesAsHours } from "../../utils/date";
import type { MonthlyCellStatus, MonthlyGrid } from "./attendance.monthly";

export interface MonthlyPdfMeta {
  generatedBy: string;
  generatedAt?: Date;
}

interface StatusStyle {
  code: string;
  bg: string;
  fg: string;
}

const STATUS_STYLES: Record<MonthlyCellStatus, StatusStyle> = {
  present: { code: "P", bg: "#10b981", fg: "#ffffff" },
  half_day: { code: "H", bg: "#fbbf24", fg: "#1e293b" },
  absent: { code: "A", bg: "#ef4444", fg: "#ffffff" },
  leave: { code: "L", bg: "#0ea5e9", fg: "#ffffff" },
  weekly_off: { code: "WO", bg: "#e2e8f0", fg: "#475569" },
  holiday: { code: "HO", bg: "#a855f7", fg: "#ffffff" },
  holiday_worked: { code: "HW", bg: "#0d9488", fg: "#ffffff" },
  none: { code: "", bg: "#f8fafc", fg: "#cbd5e1" },
};

const LEGEND_ITEMS: { code: string; label: string; bg: string; fg: string }[] = [
  { code: "P", label: "Present", bg: "#10b981", fg: "#ffffff" },
  { code: "A", label: "Absent", bg: "#ef4444", fg: "#ffffff" },
  { code: "H", label: "Half Day", bg: "#fbbf24", fg: "#1e293b" },
  { code: "L", label: "Leave", bg: "#0ea5e9", fg: "#ffffff" },
  { code: "WO", label: "Weekly Off", bg: "#e2e8f0", fg: "#475569" },
  { code: "HO", label: "Holiday", bg: "#a855f7", fg: "#ffffff" },
  { code: "HW", label: "Holiday Worked", bg: "#0d9488", fg: "#ffffff" },
];

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** Builds an HRMS-style monthly attendance register PDF (A4 landscape). */
export async function buildMonthlyCalendarPdf(
  grid: MonthlyGrid,
  meta: MonthlyPdfMeta
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 20,
      bufferPages: true,
      info: {
        Title: `Monthly Attendance — ${grid.label}`,
        Author: meta.generatedBy,
        Subject: "Monthly Attendance Register",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 20;
    const footerH = 22;

    const generatedAt = meta.generatedAt ?? new Date();
    const dateStr = generatedAt.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const colSn = 16;
    const colName = 68;
    const colId = 42;
    const colDept = 46;
    const infoW = colSn + colName + colId + colDept;

    const sumCols = [
      { key: "P", w: 16 },
      { key: "H", w: 16 },
      { key: "A", w: 16 },
      { key: "L", w: 16 },
      { key: "WO", w: 18 },
      { key: "HO", w: 16 },
      { key: "HW", w: 16 },
      { key: "WD", w: 18 },
      { key: "Hrs", w: 34 },
      { key: "Att%", w: 28 },
    ] as const;
    const summaryW = sumCols.reduce((s, c) => s + c.w, 0);

    const contentW = pageW - margin * 2;

    /** Scale day columns so the full table fits within the page for 28–31 day months. */
    function computeLayout() {
      let dayW = Math.floor((contentW - infoW - summaryW) / grid.daysInMonth);
      const minDayW = 8;
      const maxDayW = 13;
      dayW = Math.max(minDayW, Math.min(maxDayW, dayW));
      let tableW = infoW + dayW * grid.daysInMonth + summaryW;
      if (tableW > contentW) {
        dayW = Math.max(minDayW, Math.floor((contentW - infoW - summaryW) / grid.daysInMonth));
        tableW = infoW + dayW * grid.daysInMonth + summaryW;
      }
      const tableX = margin + Math.max(0, (contentW - tableW) / 2);
      return { dayW, tableW, tableX };
    }

    let { dayW, tableW, tableX } = computeLayout();

    const rowH = 14;
    const headerRowH = 22;

    let y = margin;

    const HEADER_H = 48;
    const META_W = 155;
    const LOGO_H = 30;

    const reports = getSettings().reports;

    function drawPageHeader(full: boolean) {
      const top = y;
      const logoW = reports.includeLogo
        ? drawPdfLogo(doc, { x: margin, y: top + 4, height: LOGO_H })
        : 0;
      const leftPad = logoW > 0 ? logoW + 12 : 0;
      const centerW = pageW - margin * 2 - leftPad - META_W;

      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13)
        .text("Monthly Attendance Register", margin + leftPad, top + 8, {
          width: centerW,
          align: "center",
        });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#334155")
        .text(grid.label, margin + leftPad, top + 26, {
          width: centerW,
          align: "center",
        });

      doc.font("Helvetica").fontSize(7.5).fillColor("#64748b")
        .text(`Generated: ${dateStr}`, pageW - margin - META_W, top + 8, {
          width: META_W,
          align: "right",
        })
        .text(`Prepared by: ${meta.generatedBy}`, pageW - margin - META_W, top + 20, {
          width: META_W,
          align: "right",
        });

      y = top + HEADER_H;

      if (full) {
        doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
        y += 10;
        drawLegend();
        y += 14;
        drawHolidayList();
        if (grid.holidays.length) y += 6;
      }
    }

    function drawHolidayList() {
      if (!grid.holidays.length) return;
      const ly = y;
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#475569")
        .text("Holidays:", margin, ly);
      const names = grid.holidays
        .map((h) => `${h.date.slice(8)} ${h.name}`)
        .join("  ·  ");
      doc.font("Helvetica").fontSize(6).fillColor("#64748b")
        .text(names, margin + 42, ly, { width: contentW - 42, lineGap: 1 });
      y += grid.holidays.length > 4 ? 20 : 12;
    }

    function drawLegend() {
      let lx = margin;
      const ly = y;
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#475569")
        .text("Legend:", lx, ly + 2);
      lx += 36;

      for (const item of LEGEND_ITEMS) {
        doc.rect(lx, ly, 10, 10).fill(item.bg);
        doc.fillColor(item.fg).font("Helvetica-Bold").fontSize(6)
          .text(item.code, lx, ly + 2, { width: 10, align: "center" });
        doc.fillColor("#475569").font("Helvetica").fontSize(6.5)
          .text(item.label, lx + 12, ly + 2, { width: 44 });
        lx += 58;
      }
    }

    function drawTableHeader() {
      const top = y;
      let x = tableX;

      doc.rect(x, top, infoW, headerRowH).fill("#1e293b");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6.5)
        .text("Employee Details", x + 2, top + 7, { width: infoW - 4, align: "center" });
      x += infoW;

      doc.rect(x, top, dayW * grid.daysInMonth, headerRowH).fill("#334155");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6.5)
        .text("Daily Attendance", x + 2, top + 7, { width: dayW * grid.daysInMonth - 4, align: "center" });
      x += dayW * grid.daysInMonth;

      doc.rect(x, top, summaryW, headerRowH).fill("#1e293b");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6.5)
        .text("Monthly Summary", x + 2, top + 7, { width: summaryW - 4, align: "center" });

      const subTop = top + headerRowH;
      x = tableX;

      const infoHeaders = [
        { label: "#", w: colSn },
        { label: "Name", w: colName },
        { label: "ID", w: colId },
        { label: "Dept", w: colDept },
      ];
      for (const h of infoHeaders) {
        doc.rect(x, subTop, h.w, headerRowH).fill("#f1f5f9");
        doc.rect(x, subTop, h.w, headerRowH).stroke("#cbd5e1");
        doc.fillColor("#334155").font("Helvetica-Bold").fontSize(6)
          .text(h.label, x + 1, subTop + 7, { width: h.w - 2, align: "center", ellipsis: true });
        x += h.w;
      }

      for (let d = 1; d <= grid.daysInMonth; d++) {
        const dateStr = `${grid.year}-${String(grid.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const wd = new Date(grid.year, grid.month - 1, d).getDay();
        const weekend = wd === 0 || wd === 6;
        const holiday = grid.holidays.find((h) => h.date === dateStr);
        doc.rect(x, subTop, dayW, headerRowH).fill(holiday ? "#ede9fe" : weekend ? "#e2e8f0" : "#f1f5f9");
        doc.rect(x, subTop, dayW, headerRowH).stroke("#cbd5e1");
        doc.fillColor(holiday ? "#6d28d9" : "#334155").font("Helvetica-Bold").fontSize(5.5)
          .text(String(d), x, subTop + (holiday ? 2 : 3), { width: dayW, align: "center" });
        if (holiday) {
          doc.font("Helvetica").fontSize(3.5).fillColor("#7c3aed")
            .text(holiday.name.slice(0, 6), x, subTop + 10, { width: dayW, align: "center", ellipsis: true });
        } else {
          doc.font("Helvetica").fontSize(4.5).fillColor("#64748b")
            .text(WEEKDAY_LETTERS[wd], x, subTop + 10, { width: dayW, align: "center" });
        }
        x += dayW;
      }

      for (const sc of sumCols) {
        doc.rect(x, subTop, sc.w, headerRowH).fill("#f1f5f9");
        doc.rect(x, subTop, sc.w, headerRowH).stroke("#cbd5e1");
        doc.fillColor("#334155").font("Helvetica-Bold").fontSize(5.5)
          .text(sc.key, x + 1, subTop + 7, { width: sc.w - 2, align: "center" });
        x += sc.w;
      }

      y = subTop + headerRowH;
    }

    function newPage() {
      doc.addPage({ size: "A4", layout: "landscape", margin: 20 });
      y = margin;
      ({ dayW, tableW, tableX } = computeLayout());
      drawPageHeader(false);
      drawTableHeader();
    }

    function drawEmployeeRow(index: number, emp: MonthlyGrid["employees"][number]) {
      if (y + rowH > pageH - margin - footerH) {
        newPage();
      }

      const top = y;
      let x = tableX;

      const infoCells: { text: string; w: number; align?: "left" | "center" }[] = [
        { text: String(index + 1), w: colSn, align: "center" },
        { text: emp.name, w: colName, align: "left" },
        { text: emp.employeeCode, w: colId, align: "center" },
        { text: emp.department ?? "-", w: colDept, align: "center" },
      ];

      for (const cell of infoCells) {
        doc.rect(x, top, cell.w, rowH).fill(index % 2 === 0 ? "#ffffff" : "#f8fafc");
        doc.rect(x, top, cell.w, rowH).stroke("#e2e8f0");
        doc.fillColor("#1e293b").font("Helvetica").fontSize(5.5)
          .text(cell.text, x + 2, top + 4, {
            width: cell.w - 4,
            align: cell.align ?? "left",
            ellipsis: true,
          });
        x += cell.w;
      }

      for (const day of emp.days) {
        const style = STATUS_STYLES[day.status];
        doc.rect(x, top, dayW, rowH).fill(style.bg);
        doc.rect(x, top, dayW, rowH).stroke("#e2e8f0");
        if (style.code) {
          doc.fillColor(style.fg).font("Helvetica-Bold").fontSize(5)
            .text(style.code, x, top + 4, { width: dayW, align: "center" });
        }
        x += dayW;
      }

      const s = emp.summary;
      const hoursLabel = formatMinutesAsHours(s.totalMinutes).replace(" ", "");
      const summaryValues = [
        String(s.present),
        String(s.halfDay),
        String(s.absent),
        String(s.leave),
        String(s.weeklyOff),
        String(s.holidays),
        String(s.holidayWorked),
        String(s.workingDays),
        hoursLabel,
        `${s.attendancePercentage}%`,
      ];

      for (let i = 0; i < sumCols.length; i++) {
        const sc = sumCols[i];
        doc.rect(x, top, sc.w, rowH).fill(index % 2 === 0 ? "#ffffff" : "#f8fafc");
        doc.rect(x, top, sc.w, rowH).stroke("#e2e8f0");
        doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(5)
          .text(summaryValues[i], x + 1, top + 4, { width: sc.w - 2, align: "center", ellipsis: true });
        x += sc.w;
      }

      y += rowH;
    }

    function drawFooters() {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const fy = pageH - margin - 10;
        const footerLeft = `${getCompanyName()} · ${SYSTEM_NAME} · Monthly Attendance Register · ${grid.label}`;
        doc.font("Helvetica").fontSize(7).fillColor("#94a3b8")
          .text(footerLeft, margin, fy, { width: contentW * 0.65, align: "left" });
        if (reports.autoPageNumbers) {
          doc.text(
            `Page ${i - range.start + 1} of ${range.count}`,
            margin,
            fy,
            { width: contentW, align: "right" }
          );
        }
        if (reports.signatureText?.trim()) {
          doc.text(reports.signatureText.trim(), margin, fy - 10, { width: contentW, align: "right" });
        }
      }
    }

    drawPageHeader(true);
    drawTableHeader();

    if (grid.employees.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#64748b")
        .text("No employee attendance data for this period.", tableX, y + 10);
    } else {
      grid.employees.forEach((emp, idx) => drawEmployeeRow(idx, emp));
    }

    drawFooters();
    doc.end();
  });
}
