import sharp from "sharp";
import { ApiError } from "../../utils/errors";
import type { AttendancePdfSignature } from "./attendance.monthlyPdfSignature";

const MIN_SIGNATURE_BYTES = 32;
const MAX_SIGNATURE_WIDTH = 800;
const MAX_SIGNATURE_HEIGHT = 280;

export type SignatureSource = {
  file?: Express.Multer.File;
  useSaved?: boolean;
  savedBuffer?: Buffer | null;
  name: string;
  designation: string;
  date: string;
};

export function isAuthorizedSignatureRole(role: string | undefined): boolean {
  return role === "admin" || role === "junior_admin";
}

export function signatureFieldsValid(input: {
  name: string;
  date: string;
  hasImage: boolean;
}): string | null {
  if (!input.hasImage) return "Add a signature by drawing, uploading, or using your saved signature.";
  if (!input.name.trim()) return "Signer name is required.";
  if (!input.date.trim()) return "Signature date is required.";
  return null;
}

export async function normalizeSignatureImage(buffer: Buffer): Promise<Buffer> {
  if (!buffer?.length || buffer.length < MIN_SIGNATURE_BYTES) {
    throw ApiError.badRequest("The signature image is empty or invalid.");
  }
  try {
    return await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_SIGNATURE_WIDTH,
        height: MAX_SIGNATURE_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    throw ApiError.badRequest("Could not read the signature image. Upload a PNG or JPG file.");
  }
}

export async function resolveAttendancePdfSignature(input: {
  format: "pdf" | "excel";
  requireSignature: boolean;
  source: SignatureSource;
}): Promise<AttendancePdfSignature | undefined> {
  if (input.format !== "pdf") return undefined;

  const uploaded = input.source.file?.buffer ?? null;
  const saved = input.source.useSaved ? input.source.savedBuffer ?? null : null;
  const raw = uploaded ?? saved;
  const hasImage = Boolean(raw && raw.length > 0);

  if (input.requireSignature || hasImage) {
    const fieldError = signatureFieldsValid({
      name: input.source.name,
      date: input.source.date,
      hasImage,
    });
    if (fieldError) throw ApiError.badRequest(fieldError);
  }

  if (!hasImage || !raw) return undefined;

  const image = await normalizeSignatureImage(raw);
  return {
    image,
    name: input.source.name.trim(),
    designation: input.source.designation.trim(),
    date: input.source.date.trim(),
  };
}
