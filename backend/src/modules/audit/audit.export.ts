import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getCompanyName, getDocumentCreator } from "../../config/branding";
import { formatDisplayDateTime } from "../../utils/formatDisplay";
import { drawPdfReportHeader } from "../../utils/pdfBranding";
import { getSettings } from "../settings/settings.cache";
import type { AuditLogView } from "./audit.repository";

function roleLabel(role: string | null | undefined): string {
  if (!role) return "-";
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "Employee";
}

function statusLabel(status: string): string {
  return status === "failed" ? "Failed" : "Success";
}

export async function buildAuditLogsExcel(logs: AuditLogView[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = getDocumentCreator();
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Audit Logs");
  sheet.mergeCells(1, 1, 1, 11);
  sheet.getCell(1, 1).value = `${getCompanyName()} — Audit Logs`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.mergeCells(2, 1, 2, 11);
  sheet.getCell(2, 1).value = `Exported: ${formatDisplayDateTime(new Date())} · ${logs.length} records`;
  sheet.getCell(2, 1).font = { size: 10, color: { argb: "FF64748B" } };

  const headers = [
    "Date & Time",
    "User Name",
    "Employee ID",
    "Role",
    "Action",
    "Module",
    "Action Type",
    "Description",
    "Status",
    "IP Address",
    "Device / Browser",
  ];
  sheet.getRow(4).values = headers;
  sheet.getRow(4).font = { bold: true };
  sheet.getRow(4).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" },
  };

  sheet.columns = [
    { width: 20 },
    { width: 22 },
    { width: 14 },
    { width: 12 },
    { width: 22 },
    { width: 14 },
    { width: 18 },
    { width: 40 },
    { width: 10 },
    { width: 16 },
    { width: 36 },
  ];

  for (const log of logs) {
    sheet.addRow([
      formatDisplayDateTime(log.created_at),
      log.actor_name ?? "-",
      log.actor_code ?? "-",
      roleLabel(log.actor_role),
      log.action_label,
      log.module,
      log.action_type,
      log.description,
      statusLabel(log.status),
      log.ip_address ?? "-",
      log.user_agent ?? "-",
    ]);
  }

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildAuditLogsPdf(logs: AuditLogView[]): Promise<Buffer> {
  const reports = getSettings().reports;
  const subtitle = `Audit Logs — Exported ${formatDisplayDateTime(new Date())} · ${logs.length} records`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
      info: {
        Title: `${getCompanyName()} — Audit Logs`,
        Author: getDocumentCreator(),
        Creator: getDocumentCreator(),
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = drawPdfReportHeader(doc, {
      margin: doc.page.margins.left,
      pageWidth: doc.page.width,
      title: "Audit Logs",
      subtitle,
      includeLogo: reports.includeLogo,
      signatureText: reports.signatureText,
    });

    const margin = doc.page.margins.left;
    const pageBottom = doc.page.height - doc.page.margins.bottom - 24;
    const columns = [
      { label: "Date & Time", width: 78 },
      { label: "User", width: 90 },
      { label: "ID", width: 55 },
      { label: "Role", width: 45 },
      { label: "Action", width: 85 },
      { label: "Module", width: 55 },
      { label: "Status", width: 40 },
      { label: "IP", width: 70 },
      { label: "Description", width: 170 },
    ];

    function ensureSpace(needed: number): void {
      if (y + needed <= pageBottom) return;
      doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
      y = drawPdfReportHeader(doc, {
        margin: doc.page.margins.left,
        pageWidth: doc.page.width,
        title: "Audit Logs",
        subtitle,
        includeLogo: reports.includeLogo,
        signatureText: reports.signatureText,
      });
    }

    function drawHeader(): void {
      ensureSpace(24);
      let x = margin;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#0f172a");
      for (const col of columns) {
        doc.text(col.label, x, y, { width: col.width, ellipsis: true });
        x += col.width;
      }
      y += 12;
      doc.moveTo(margin, y).lineTo(x, y).strokeColor("#cbd5e1").stroke();
      y += 4;
      doc.font("Helvetica").fontSize(7).fillColor("#000000");
    }

    drawHeader();

    if (logs.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("No audit logs match the current filters.", margin, y);
    } else {
      for (const log of logs) {
        ensureSpace(16);
        const values = [
          formatDisplayDateTime(log.created_at),
          log.actor_name ?? "-",
          log.actor_code ?? "-",
          roleLabel(log.actor_role),
          log.action_label,
          log.module,
          statusLabel(log.status),
          log.ip_address ?? "-",
          log.description,
        ];
        let x = margin;
        for (let i = 0; i < columns.length; i++) {
          doc.text(values[i].slice(0, 120), x, y, { width: columns[i].width, ellipsis: true });
          x += columns[i].width;
        }
        y += 13;
      }
    }

    if (reports.autoPageNumbers) {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - doc.page.margins.bottom + 6;
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#64748b")
          .text(`Page ${i + 1} of ${range.count}`, doc.page.margins.left, footerY, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: "center",
          });
      }
    }

    doc.end();
  });
}
