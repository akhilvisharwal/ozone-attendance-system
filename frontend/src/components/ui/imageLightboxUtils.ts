export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/** object-fit: contain — shrink large images, never upscale small ones. */
export function computeFitScale(container: Size, image: Size): number {
  if (!container.width || !container.height || !image.width || !image.height) return 1;
  return Math.min(1, container.width / image.width, container.height / image.height);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPan(pan: Point, scale: number, natural: Size, container: Size): Point {
  const displayWidth = natural.width * scale;
  const displayHeight = natural.height * scale;
  const maxX = Math.max(0, (displayWidth - container.width) / 2);
  const maxY = Math.max(0, (displayHeight - container.height) / 2);
  return {
    x: clamp(pan.x, -maxX, maxX),
    y: clamp(pan.y, -maxY, maxY),
  };
}

export function canPanImage(scale: number, natural: Size, container: Size, fitScale: number): boolean {
  const displayWidth = natural.width * scale;
  const displayHeight = natural.height * scale;
  return (
    scale > fitScale + 0.001 ||
    displayWidth > container.width + 1 ||
    displayHeight > container.height + 1
  );
}

export function zoomAroundPoint(
  currentScale: number,
  nextScale: number,
  pan: Point,
  focal: Point,
  container: Size,
  natural: Size
): { scale: number; pan: Point } {
  const clampedScale = nextScale;
  const ratio = clampedScale / currentScale;
  const centerX = container.width / 2;
  const centerY = container.height / 2;
  const nextPan = {
    x: focal.x - ratio * (focal.x - pan.x - centerX) - centerX,
    y: focal.y - ratio * (focal.y - pan.y - centerY) - centerY,
  };
  return {
    scale: clampedScale,
    pan: clampPan(nextPan, clampedScale, natural, container),
  };
}
