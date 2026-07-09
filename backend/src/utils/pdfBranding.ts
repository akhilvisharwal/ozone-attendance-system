import fs from "fs";
import path from "path";
import { env } from "../config/env";
import { formatCompanyContactLine, getCompanyName } from "../config/branding";
import { getSettings } from "../modules/settings/settings.cache";
import { formatDisplayDateTime } from "./formatDisplay";

/** Width / height of branding/logo.png — keep in sync with frontend config. */
export const LOGO_ASPECT_RATIO = 4.12;

/** Resolves logo from admin settings, then env, then default assets. */
export function resolveCompanyLogoPath(): string | null {
  let configured: string | undefined;
  try {
    configured = getSettings().company.logoPath?.trim();
  } catch {
    configured = env.companyLogoPath?.trim();
  }

  const candidates = [
    configured,
    env.companyLogoPath?.trim(),
    path.join(process.cwd(), "assets", "logo.png"),
    path.join(process.cwd(), "..", "branding", "logo.png"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return resolved;
    const fromRepo = path.join(process.cwd(), "..", candidate);
    if (fs.existsSync(fromRepo)) return fromRepo;
  }
  return null;
}

export interface PdfLogoOptions {
  x: number;
  y: number;
  height?: number;
}

type PdfDoc = PDFKit.PDFDocument;

/** Draws the company logo preserving aspect ratio. Returns drawn width (0 if skipped). */
export function drawPdfLogo(doc: PdfDoc, options: PdfLogoOptions): number {
  const height = options.height ?? 32;
  const width = Math.round(height * LOGO_ASPECT_RATIO);
  const logoPath = resolveCompanyLogoPath();

  if (logoPath) {
    try {
      doc.image(logoPath, options.x, options.y, { fit: [width, height] });
      return width;
    } catch {
      // Fall through to text badge if image format unsupported.
    }
  }

  const name = getCompanyName();
  doc.roundedRect(options.x, options.y, height, height, 6).fill("#2563eb");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12)
    .text(name.slice(0, 2).toUpperCase(), options.x, options.y + height / 2 - 6, {
      width: height,
      align: "center",
    });
  return height;
}

export interface PdfReportHeaderOptions {
  title: string;
  subtitle?: string;
  margin: number;
  pageWidth: number;
  includeLogo?: boolean;
  signatureText?: string;
}

function formatGeneratedAt(): string {
  try {
    const tz = getSettings().company.timezone;
    return formatDisplayDateTime(new Date());
  } catch {
    return formatDisplayDateTime(new Date());
  }
}

/** Branded header: logo left, title/subtitle centered. */
export function drawPdfReportHeader(doc: PdfDoc, options: PdfReportHeaderOptions): number {
  const { margin, pageWidth, title, subtitle, includeLogo = true } = options;
  const top = margin;
  const logoHeight = 32;
  const logoWidth = includeLogo ? drawPdfLogo(doc, { x: margin, y: top, height: logoHeight }) : 0;

  const metaWidth = 150;
  const leftPad = logoWidth > 0 ? logoWidth + 14 : 0;
  const centerWidth = pageWidth - margin * 2 - leftPad - metaWidth;
  const titleX = margin + leftPad;

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13)
    .text(title, titleX, top + 6, { width: Math.max(centerWidth, pageWidth - margin * 2 - metaWidth), align: logoWidth > 0 ? "center" : "left" });

  let headerBottom = top + (logoWidth > 0 ? logoHeight : 24);

  if (subtitle) {
    doc.font("Helvetica").fontSize(10).fillColor("#64748b")
      .text(subtitle, titleX, top + 24, { width: Math.max(centerWidth, pageWidth - margin * 2 - metaWidth), align: logoWidth > 0 ? "center" : "left" });
    headerBottom = Math.max(headerBottom, top + 38);
  }

  const contactLine = formatCompanyContactLine();
  if (contactLine) {
    const contactY = subtitle ? top + 38 : top + 24;
    doc.font("Helvetica").fontSize(8).fillColor("#64748b")
      .text(contactLine, titleX, contactY, { width: Math.max(centerWidth, pageWidth - margin * 2 - metaWidth), align: logoWidth > 0 ? "center" : "left" });
    headerBottom = Math.max(headerBottom, contactY + 12);
  }

  doc.font("Helvetica").fontSize(8).fillColor("#64748b")
    .text(`Generated: ${formatGeneratedAt()}`,
      pageWidth - margin - metaWidth, top + 6, { width: metaWidth, align: "right" });

  if (options.signatureText?.trim()) {
    doc.font("Helvetica").fontSize(8).fillColor("#64748b")
      .text(options.signatureText.trim(), margin, headerBottom + 2, { width: pageWidth - margin * 2, align: "right" });
    headerBottom += 14;
  }

  doc.fillColor("#000000");
  return headerBottom + 14;
}

export { getCompanyName as COMPANY_NAME };
