import type PDFKit from "pdfkit";

export interface AttendancePdfSignature {
  image: Buffer;
  name: string;
  designation: string;
  date: string;
}

/** Extra footer space reserved so the signature block never overlaps the grid. */
export const SIGNATURE_BLOCK_HEIGHT = 80;

export function attendancePdfFooterHeight(hasSignature: boolean): number {
  return hasSignature ? 22 + SIGNATURE_BLOCK_HEIGHT : 22;
}

/**
 * Draws the authorized-signature block at the bottom-right of a landscape A4 page,
 * above the compact company/page-number footer.
 */
export function drawAttendancePdfSignature(
  doc: PDFKit.PDFDocument,
  input: {
    pageW: number;
    pageH: number;
    margin: number;
    signature: AttendancePdfSignature;
  }
): void {
  const { pageW, pageH, margin, signature } = input;
  const blockW = 168;
  const x = pageW - margin - blockW;
  const y = pageH - margin - 22 - SIGNATURE_BLOCK_HEIGHT + 6;
  const imageH = 32;

  try {
    doc.image(signature.image, x, y, { fit: [blockW - 8, imageH] });
  } catch {
    doc.rect(x, y, blockW - 8, imageH).stroke("#cbd5e1");
  }

  let textY = y + imageH + 4;
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a")
    .text("Authorized Signature", x, textY, { width: blockW, align: "left" });
  textY += 11;
  doc.font("Helvetica").fontSize(7).fillColor("#334155")
    .text(`Name  ${signature.name}`, x, textY, { width: blockW, ellipsis: true });
  textY += 10;
  if (signature.designation.trim()) {
    doc.text(`Designation  ${signature.designation}`, x, textY, { width: blockW, ellipsis: true });
    textY += 10;
  }
  doc.text(`Date  ${formatSignatureDate(signature.date)}`, x, textY, { width: blockW, ellipsis: true });
}

function formatSignatureDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  return `${match[3]}/${match[2]}/${match[1]}`;
}
