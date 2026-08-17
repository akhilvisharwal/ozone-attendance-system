import PDFDocument from "pdfkit";
import { formatCompanyContactLine, getCompanyName, SYSTEM_NAME } from "../../config/branding";
import { drawPdfLogo } from "../../utils/pdfBranding";
import { formatDisplayDateTime } from "../../utils/formatDisplay";
import { getSettings } from "../settings/settings.cache";
import { formatAdvanceAmount } from "./attendance.monthlyPdf";
import type { MonthlyCellStatus, MonthlyGrid } from "./attendance.monthly";
import type { MonthlyPdfMeta } from "./attendance.monthlyPdf";

interface StatusStyle {
  code: string;
  bg: string;
  fg: string;
}

/**
 * Pastel, not saturated — matches the print-friendly bar set by the Detailed PDF's
 * own prior redesign (see attendance.monthlyPdf.test.ts, which guards against the
 * old saturated fills). "Green/red/amber" here means clearly-distinguishable pastel
 * tints, a step up in saturation from the Detailed grid's near-white cells so status
 * reads at a glance, not a return to heavy ink-cost colors.
 */
const STATUS_STYLES: Record<MonthlyCellStatus, StatusStyle> = {
  present: { code: "P", bg: "#bbf7d0", fg: "#14532d" },
  half_day: { code: "H", bg: "#fde68a", fg: "#78350f" },
  absent: { code: "A", bg: "#fca5a5", fg: "#7f1d1d" },
  leave: { code: "L", bg: "#dbeafe", fg: "#1e3a8a" },
  weekly_off: { code: "WO", bg: "#e5e7eb", fg: "#374151" },
  holiday: { code: "HO", bg: "#ede9fe", fg: "#4c1d95" },
  holiday_worked: { code: "HW", bg: "#ccfbf1", fg: "#134e4a" },
  weekly_off_worked: { code: "WW", bg: "#e0e7ff", fg: "#312e81" },
  none: { code: "", bg: "#ffffff", fg: "#000000" },
  not_applicable: { code: "", bg: "#f3f4f6", fg: "#94a3b8" },
};

/** Late check-in overlay — same tint family as the Detailed PDF for consistency. */
const LATE_STYLE: StatusStyle = { code: "", bg: "#ffedd5", fg: "#000000" };

const LEGEND_ITEMS: { code: string; label: string; bg: string; fg: string }[] = [
  { code: "P", label: "Present", bg: STATUS_STYLES.present.bg, fg: STATUS_STYLES.present.fg },
  { code: "A", label: "Absent", bg: STATUS_STYLES.absent.bg, fg: STATUS_STYLES.absent.fg },
  { code: "H", label: "Half Day", bg: STATUS_STYLES.half_day.bg, fg: STATUS_STYLES.half_day.fg },
  { code: "L", label: "Leave", bg: STATUS_STYLES.leave.bg, fg: STATUS_STYLES.leave.fg },
  { code: "WO", label: "Weekly Off", bg: STATUS_STYLES.weekly_off.bg, fg: STATUS_STYLES.weekly_off.fg },
  { code: "HO", label: "Holiday", bg: STATUS_STYLES.holiday.bg, fg: STATUS_STYLES.holiday.fg },
  { code: "HW", label: "Worked on Holiday", bg: STATUS_STYLES.holiday_worked.bg, fg: STATUS_STYLES.holiday_worked.fg },
  { code: "WW", label: "Worked on Weekly Off", bg: STATUS_STYLES.weekly_off_worked.bg, fg: STATUS_STYLES.weekly_off_worked.fg },
  { code: "LT", label: "Late Check-in", bg: LATE_STYLE.bg, fg: LATE_STYLE.fg },
  { code: "—", label: "Not Applicable (before joining)", bg: "#f3f4f6", fg: "#000000" },
];

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Builds a large-print, quick-reading Monthly Attendance PDF (A4 landscape).
 *
 * This is a sibling to buildMonthlyCalendarPdf, not a replacement — it reuses the
 * same MonthlyGrid data (no separate DB queries) but renders a simplified layout:
 * bigger day cells and fonts, a two-row date+weekday header, and just four
 * summary figures (Present/Absent/Half Day/Att%) plus a single Advance Owed
 * figure, instead of the Detailed PDF's full per-status and per-advance-type
 * column set. Role (Employee Details) and Hrs (Monthly Summary) are dropped
 * here specifically — Simple-only trims, the Detailed PDF keeps both — and
 * the width they free is redistributed into the daily grid, not left as
 * blank margin (see computeLayout below).
 */
export async function buildMonthlyCalendarPdfSimple(
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
        Title: `Monthly Attendance (Simple) — ${grid.label}`,
        Author: meta.generatedBy,
        Subject: "Monthly Attendance Register — Simple",
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
    const dateStr = formatDisplayDateTime(generatedAt);

    // No Role column here (Simple-only trim — Detailed keeps it): one less
    // column in Employee Details, freeing width for the daily grid below.
    const colSn = 16;
    const colName = 74;
    const colId = 44;
    const infoW = colSn + colName + colId;

    // Five summary columns (vs the Detailed PDF's fifteen) — no Hrs here
    // (Simple-only trim — Detailed keeps it) — the freed-up width, along
    // with Role's, goes to bigger day cells below.
    const sumCols = [
      { key: "Present", w: 38 },
      { key: "Absent", w: 38 },
      { key: "Half Day", w: 40 },
      { key: "Att%", w: 32 },
      { key: "Adv Owed", w: 50 },
    ] as const;
    const summaryW = sumCols.reduce((s, c) => s + c.w, 0);

    const contentW = pageW - margin * 2;

    /**
     * Scale day columns so the full table fits, biased toward bigger cells than
     * the Detailed PDF. minDayW (13) intentionally matches Detailed's own
     * maxDayW, so Simple's smallest day cell is never smaller than Detailed's
     * biggest — but a naive Math.max(minDayW, ...) clamp can silently push the
     * table past the page's right edge for longer months if the column widths
     * above ever grow (this is exactly how "Adv Owed" — the last column —
     * previously rendered off-page and looked entirely missing, not
     * misplaced). The re-clamp below is the actual guarantee against that:
     * unlike a plain min/max clamp, it re-measures the table and shrinks dayW
     * again if it still doesn't fit, so the table can never exceed contentW.
     */
    function computeLayout() {
      let dayW = Math.floor((contentW - infoW - summaryW) / grid.daysInMonth);
      const minDayW = 13;
      const maxDayW = 22;
      dayW = Math.max(minDayW, Math.min(maxDayW, dayW));
      let tableW = infoW + dayW * grid.daysInMonth + summaryW;
      if (tableW > contentW) {
        dayW = Math.max(1, Math.floor((contentW - infoW - summaryW) / grid.daysInMonth));
        tableW = infoW + dayW * grid.daysInMonth + summaryW;
      }
      const tableX = margin + Math.max(0, (contentW - tableW) / 2);
      return { dayW, tableW, tableX };
    }

    let { dayW, tableX } = computeLayout();

    const rowH = 22;
    const groupHeaderH = 18;
    const dateRowH = 17;
    const weekdayRowH = 14;
    const subHeaderH = dateRowH + weekdayRowH;

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

      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14)
        .text("Monthly Attendance — Simple", margin + leftPad, top + 6, {
          width: centerW,
          align: "center",
        });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#334155")
        .text(grid.label, margin + leftPad, top + 25, {
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
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#475569").text("Holidays:", margin, ly);
      const names = grid.holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join("  ·  ");
      doc.font("Helvetica").fontSize(6.5).fillColor("#64748b")
        .text(names, margin + 46, ly, { width: contentW - 46, lineGap: 1 });
      y += grid.holidays.length > 4 ? 20 : 12;
    }

    function drawLegend() {
      let lx = margin;
      const ly = y;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#475569").text("Legend:", lx, ly + 2);
      lx += 38;

      for (const item of LEGEND_ITEMS) {
        doc.rect(lx, ly, 11, 11).fill(item.bg);
        doc.rect(lx, ly, 11, 11).stroke("#cbd5e1");
        doc.fillColor(item.fg).font("Helvetica-Bold").fontSize(6.5)
          .text(item.code, lx, ly + 2.5, { width: 11, align: "center" });
        doc.fillColor("#000000").font("Helvetica").fontSize(7)
          .text(item.label, lx + 13, ly + 2.5, { width: 48 });
        lx += 62;
      }
    }

    function drawTableHeader() {
      const top = y;
      let x = tableX;

      doc.rect(x, top, infoW, groupHeaderH).fill("#1e293b");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7)
        .text("Employee Details", x + 2, top + 5.5, { width: infoW - 4, align: "center" });
      x += infoW;

      doc.rect(x, top, dayW * grid.daysInMonth, groupHeaderH).fill("#334155");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7)
        .text("Daily Attendance", x + 2, top + 5.5, { width: dayW * grid.daysInMonth - 4, align: "center" });
      x += dayW * grid.daysInMonth;

      doc.rect(x, top, summaryW, groupHeaderH).fill("#1e293b");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7)
        .text("Monthly Summary", x + 2, top + 5.5, { width: summaryW - 4, align: "center" });

      const subTop = top + groupHeaderH;
      x = tableX;

      const infoHeaders = [
        { label: "#", w: colSn },
        { label: "Name", w: colName },
        { label: "ID", w: colId },
      ];
      for (const h of infoHeaders) {
        doc.rect(x, subTop, h.w, subHeaderH).fill("#f1f5f9");
        doc.rect(x, subTop, h.w, subHeaderH).stroke("#cbd5e1");
        doc.fillColor("#334155").font("Helvetica-Bold").fontSize(7)
          .text(h.label, x + 2, subTop + subHeaderH / 2 - 4, { width: h.w - 4, align: "center", ellipsis: true });
        x += h.w;
      }

      // Two-row day header: date number on top, weekday abbreviation below — computed
      // from the real calendar for this grid's month/year (grid.year / grid.month are
      // already on the object, so this needs no new data fetching).
      for (let d = 1; d <= grid.daysInMonth; d++) {
        const dateKey = `${grid.year}-${String(grid.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const wd = new Date(grid.year, grid.month - 1, d).getDay();
        const weeklyOffColumn = grid.defaultWeeklyOffDays.includes(wd);
        const holiday = grid.holidays.find((h) => h.date === dateKey);
        const headerBg = holiday ? "#ede9fe" : weeklyOffColumn ? "#e2e8f0" : "#f1f5f9";

        doc.rect(x, subTop, dayW, dateRowH).fill(headerBg);
        doc.rect(x, subTop, dayW, dateRowH).stroke("#cbd5e1");
        doc.fillColor(holiday ? "#6d28d9" : "#1e293b").font("Helvetica-Bold").fontSize(8)
          .text(String(d), x, subTop + 3.5, { width: dayW, align: "center" });

        doc.rect(x, subTop + dateRowH, dayW, weekdayRowH).fill(headerBg);
        doc.rect(x, subTop + dateRowH, dayW, weekdayRowH).stroke("#cbd5e1");
        doc.font("Helvetica").fontSize(5.8).fillColor(holiday ? "#7c3aed" : "#64748b")
          .text(WEEKDAY_ABBR[wd], x, subTop + dateRowH + 3.5, { width: dayW, align: "center" });

        x += dayW;
      }

      for (const sc of sumCols) {
        doc.rect(x, subTop, sc.w, subHeaderH).fill("#f1f5f9");
        doc.rect(x, subTop, sc.w, subHeaderH).stroke("#cbd5e1");
        doc.fillColor("#334155").font("Helvetica-Bold").fontSize(6.5)
          .text(sc.key, x + 1, subTop + subHeaderH / 2 - 4, { width: sc.w - 2, align: "center", ellipsis: true });
        x += sc.w;
      }

      y = subTop + subHeaderH;
    }

    function newPage() {
      doc.addPage({ size: "A4", layout: "landscape", margin: 20 });
      y = margin;
      ({ dayW, tableX } = computeLayout());
      drawPageHeader(false);
      drawTableHeader();
    }

    function drawEmployeeRow(index: number, emp: MonthlyGrid["employees"][number]) {
      if (y + rowH > pageH - margin - footerH) {
        newPage();
      }

      const top = y;
      let x = tableX;
      const rowBg = index % 2 === 0 ? "#ffffff" : "#f8fafc";

      const infoCells: { text: string; w: number; align?: "left" | "center" }[] = [
        { text: String(index + 1), w: colSn, align: "center" },
        { text: emp.name, w: colName, align: "left" },
        { text: emp.employeeCode, w: colId, align: "center" },
      ];

      for (const cell of infoCells) {
        doc.rect(x, top, cell.w, rowH).fill(rowBg);
        doc.rect(x, top, cell.w, rowH).stroke("#e2e8f0");
        doc.fillColor("#1e293b").font("Helvetica").fontSize(7)
          .text(cell.text, x + 3, top + rowH / 2 - 4, {
            width: cell.w - 6,
            align: cell.align ?? "left",
            ellipsis: true,
          });
        x += cell.w;
      }

      for (const day of emp.days) {
        const style = STATUS_STYLES[day.status];
        const bg = day.late ? LATE_STYLE.bg : style.bg;
        const fg = day.late ? LATE_STYLE.fg : style.fg;
        doc.rect(x, top, dayW, rowH).fill(bg);
        doc.rect(x, top, dayW, rowH).stroke("#e2e8f0");
        if (style.code) {
          doc.fillColor(fg).font("Helvetica-Bold").fontSize(7.5)
            .text(style.code, x, top + rowH / 2 - 5, { width: dayW, align: "center" });
        }
        x += dayW;
      }

      const s = emp.summary;
      const summaryValues = [
        String(s.present),
        String(s.absent),
        String(s.halfDay),
        `${s.attendancePercentage}%`,
        // Advance owed = the employee's current balance (cumulative through this
        // month's end) — the same canonical figure the Advances panel and the
        // Detailed PDF's "Bal" column both read, collapsed here to one number
        // instead of the four separate taken/returned/balance/due columns.
        formatAdvanceAmount(emp.advances?.balance),
      ];

      for (let i = 0; i < sumCols.length; i++) {
        const sc = sumCols[i];
        doc.rect(x, top, sc.w, rowH).fill(rowBg);
        doc.rect(x, top, sc.w, rowH).stroke("#e2e8f0");
        doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(7)
          .text(summaryValues[i], x + 1, top + rowH / 2 - 4, { width: sc.w - 2, align: "center", ellipsis: true });
        x += sc.w;
      }

      y += rowH;
    }

    function drawFooters() {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const fy = pageH - margin - 10;
        const footerLeft = `${getCompanyName()} · ${SYSTEM_NAME} · Monthly Attendance Register (Simple) · ${grid.label}`;
        doc.font("Helvetica").fontSize(7).fillColor("#94a3b8")
          .text(footerLeft, margin, fy, { width: contentW * 0.65, align: "left" });
        const contactLine = formatCompanyContactLine();
        if (contactLine) {
          doc.text(contactLine, margin, fy + 9, { width: contentW * 0.65, align: "left" });
        }
        if (reports.autoPageNumbers) {
          doc.text(`Page ${i - range.start + 1} of ${range.count}`, margin, fy, {
            width: contentW,
            align: "right",
          });
        }
        if (reports.signatureText?.trim()) {
          doc.text(reports.signatureText.trim(), margin, fy - 10, { width: contentW, align: "right" });
        }
      }
    }

    drawPageHeader(true);
    drawTableHeader();

    if (grid.employees.length === 0) {
      doc.font("Helvetica").fontSize(11).fillColor("#64748b")
        .text("No employee attendance data for this period.", tableX, y + 10);
    } else {
      grid.employees.forEach((emp, idx) => drawEmployeeRow(idx, emp));
    }

    drawFooters();
    doc.end();
  });
}
