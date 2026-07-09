import PDFDocument from "pdfkit";
import { getDocumentCreator } from "../../config/branding";
import { drawPdfReportHeader } from "../../utils/pdfBranding";
import { formatDisplayDateTime } from "../../utils/formatDisplay";
import { getSettings } from "./settings.cache";
import type { ReadableReportBundle, ReportSection } from "./settings.backupReport.types";

function scopeTitle(scope: ReadableReportBundle["scope"]): string {
  if (scope === "employees") return "Employees Report";
  if (scope === "attendance") return "Attendance Report";
  return "Data Export Report";
}

function drawPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - doc.page.margins.bottom + 6;
    doc.font("Helvetica").fontSize(8).fillColor("#64748b")
      .text(`Page ${i + 1} of ${range.count}`, doc.page.margins.left, footerY, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "center",
      });
  }
  doc.fillColor("#000000");
}

function drawSectionTable(
  doc: PDFKit.PDFDocument,
  reportSection: ReportSection,
  startY: number,
  subtitle: string,
  scope: ReadableReportBundle["scope"]
): number {
  const margin = doc.page.margins.left;
  const pageBottom = doc.page.height - doc.page.margins.bottom - 24;
  let y = startY;

  function ensureSpace(needed: number): number {
    if (y + needed <= pageBottom) return y;
    doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
    y = drawPdfReportHeader(doc, {
      margin: doc.page.margins.left,
      pageWidth: doc.page.width,
      title: scopeTitle(scope),
      subtitle,
      includeLogo: getSettings().reports.includeLogo,
      signatureText: getSettings().reports.signatureText,
    });
    return y;
  }

  y = ensureSpace(40);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a")
    .text(`${reportSection.title} (${reportSection.recordCount} records)`, margin, y);
  y += 18;

  if (reportSection.rows.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("No records.", margin, y);
    return y + 20;
  }

  const columns = reportSection.columns;
  const rowHeight = 14;

  function drawTableHeader(): void {
    y = ensureSpace(24);
    let x = margin;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a");
    for (const col of columns) {
      doc.text(col.label, x, y, { width: col.width, ellipsis: true });
      x += col.width;
    }
    y += rowHeight;
    doc.moveTo(margin, y).lineTo(x, y).strokeColor("#cbd5e1").stroke();
    y += 4;
    doc.font("Helvetica").fontSize(7.5).fillColor("#000000");
  }

  drawTableHeader();

  for (const row of reportSection.rows) {
    y = ensureSpace(rowHeight + 4);
    let x = margin;
    for (const col of columns) {
      const text = (row[col.key] ?? "-").slice(0, 120);
      doc.text(text, x, y, { width: col.width, ellipsis: true });
      x += col.width;
    }
    y += rowHeight;
  }

  return y + 16;
}

export async function buildReadableReportPdf(bundle: ReadableReportBundle): Promise<Buffer> {
  const reports = getSettings().reports;
  const subtitle = `${scopeTitle(bundle.scope)} — Exported ${formatDisplayDateTime(bundle.exportedAt)}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
      info: {
        Title: `${bundle.companyName} — ${scopeTitle(bundle.scope)}`,
        Author: getDocumentCreator(),
        Subject: "Administrative Data Export",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = drawPdfReportHeader(doc, {
      margin: doc.page.margins.left,
      pageWidth: doc.page.width,
      title: `${bundle.companyName} — ${scopeTitle(bundle.scope)}`,
      subtitle,
      includeLogo: reports.includeLogo,
      signatureText: reports.signatureText,
    });

    for (const reportSection of bundle.sections) {
      y = drawSectionTable(doc, reportSection, y, subtitle, bundle.scope);
    }

    drawPageNumbers(doc);
    doc.end();
  });
}
