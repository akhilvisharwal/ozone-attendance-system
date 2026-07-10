/** Checkout selfies are stored as the first `site_photo_paths` entry under `selfies/`. */
export function isSelfiePath(path: string): boolean {
  return path.replace(/\\/g, "/").startsWith("selfies/");
}

export function splitAttendancePhotos(input: {
  check_in_selfie_path: string | null;
  site_photo_paths: string[];
}): {
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  sitePhotos: string[];
} {
  const checkInPhoto = input.check_in_selfie_path?.trim() || null;
  const paths = input.site_photo_paths ?? [];
  let checkOutPhoto: string | null = null;
  let sitePhotos = paths;

  if (paths.length > 0 && isSelfiePath(paths[0])) {
    checkOutPhoto = paths[0];
    sitePhotos = paths.slice(1);
  }

  return { checkInPhoto, checkOutPhoto, sitePhotos };
}
