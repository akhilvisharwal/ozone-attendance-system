export type SignatureStroke = {
  points: Array<{ x: number; y: number }>;
};

export function undoSignatureStroke(strokes: SignatureStroke[]): SignatureStroke[] {
  return strokes.slice(0, -1);
}

export function hasDrawnSignature(strokes: SignatureStroke[]): boolean {
  return strokes.some((stroke) => stroke.points.length >= 2);
}

export function todayInputDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateAttendancePdfSignature(input: {
  requireSignature: boolean;
  hasImage: boolean;
  name: string;
  date: string;
}): string | null {
  if (!input.requireSignature && !input.hasImage) return null;
  if (!input.hasImage) return "Add a signature before downloading the PDF.";
  if (!input.name.trim()) return "Enter the signer name.";
  if (!input.date.trim()) return "Enter the signature date.";
  return null;
}
