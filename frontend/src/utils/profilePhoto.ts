export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export function validateProfilePhotoFile(file: File): string | null {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExt = new Set(["jpg", "jpeg", "png", "webp"]);
  const typeOk = file.type ? allowed.has(file.type) : allowedExt.has(ext);
  if (!typeOk) {
    return "Only JPG, PNG, or WebP images are allowed.";
  }
  if (file.size <= 0) {
    return "The selected file is empty.";
  }
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    return "Profile picture must be 2 MB or smaller.";
  }
  return null;
}

/** Loads an image file into an HTMLImageElement. Caller must revoke `objectUrl` when done. */
export function loadImageFromFile(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ image: img, objectUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read the selected image."));
    };
    img.src = objectUrl;
  });
}

/**
 * Crops a square region from the source image and exports WebP (or JPEG fallback).
 * `crop` is in source-image pixel coordinates.
 */
export async function cropImageToBlob(
  image: HTMLImageElement,
  crop: { x: number; y: number; size: number },
  outputSize = 512
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the image editor.");

  ctx.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, outputSize, outputSize);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/webp", 0.86);
  });
  if (blob) return blob;

  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", 0.9);
  });
  if (!jpeg) throw new Error("Could not export the cropped image.");
  return jpeg;
}

/** Default centered square crop covering the largest possible area of the image. */
export function defaultSquareCrop(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return {
    x: Math.max(0, (width - size) / 2),
    y: Math.max(0, (height - size) / 2),
    size,
  };
}
