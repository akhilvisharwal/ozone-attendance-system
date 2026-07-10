import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Loader2,
  Maximize2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import clsx from "clsx";
import { fetchSecureFileUrl } from "@/api/client";
import { backdropVariants } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import {
  canPanImage,
  clamp,
  clampPan,
  computeFitScale,
  zoomAroundPoint,
  type Point,
  type Size,
} from "@/components/ui/imageLightboxUtils";

const MIN_ZOOM_RATIO = 0.5;
const MAX_ZOOM_RATIO = 8;
const ZOOM_STEP = 1.25;

type PinchState = {
  distance: number;
  scale: number;
  pan: Point;
  midpoint: Point;
};

type TouchPoint = { clientX: number; clientY: number };

function distanceBetweenTouches(touches: readonly TouchPoint[]): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function midpointBetweenTouches(touches: readonly TouchPoint[], rect: DOMRect): Point {
  if (touches.length < 2) return { x: rect.width / 2, y: rect.height / 2 };
  const x = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
  const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
  return { x, y };
}

export function ImageLightbox({
  open,
  path,
  title,
  onClose,
}: {
  open: boolean;
  path: string;
  title: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startPan: Point; origin: Point } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const fitInitializedRef = useRef(false);

  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const fitScale = computeFitScale(containerSize, naturalSize);
  const panEnabled = canPanImage(scale, naturalSize, containerSize, fitScale);
  const zoomPercent = Math.round(scale * 100);

  const measureContainer = useCallback(() => {
    const node = viewportRef.current;
    if (!node) return;
    setContainerSize({ width: node.clientWidth, height: node.clientHeight });
  }, []);

  const applyFitToScreen = useCallback(() => {
    const nextFit = computeFitScale(containerSize, naturalSize);
    setScale(nextFit || 1);
    setPan({ x: 0, y: 0 });
  }, [containerSize, naturalSize]);

  const applyReset100 = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const applyZoomDelta = useCallback(
    (delta: number, focal?: Point) => {
      if (!naturalSize.width || !naturalSize.height) return;
      const minScale = Math.max(fitScale * MIN_ZOOM_RATIO, 0.05);
      const maxScale = Math.max(fitScale * MAX_ZOOM_RATIO, 1);
      const nextScale = clamp(scale * delta, minScale, maxScale);
      const focalPoint = focal ?? { x: containerSize.width / 2, y: containerSize.height / 2 };
      const result = zoomAroundPoint(scale, nextScale, pan, focalPoint, containerSize, naturalSize);
      setScale(result.scale);
      setPan(result.pan);
    },
    [containerSize, fitScale, naturalSize, pan, scale]
  );

  useEffect(() => {
    if (!open) {
      setUrl(null);
      setFailed(false);
      setNaturalSize({ width: 0, height: 0 });
      setContainerSize({ width: 0, height: 0 });
      setScale(1);
      setPan({ x: 0, y: 0 });
      setDragging(false);
      dragRef.current = null;
      pinchRef.current = null;
      fitInitializedRef.current = false;
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setNaturalSize({ width: 0, height: 0 });

    fetchSecureFileUrl(path)
      .then((resolved) => {
        if (cancelled) return;
        objectUrl = resolved;
        setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, path]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    measureContainer();
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureContainer());
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, measureContainer, url]);

  useEffect(() => {
    if (!open || !naturalSize.width || !naturalSize.height || !containerSize.width) return;
    if (fitInitializedRef.current) return;
    applyFitToScreen();
    fitInitializedRef.current = true;
  }, [
    open,
    naturalSize.width,
    naturalSize.height,
    containerSize.width,
    containerSize.height,
    applyFitToScreen,
  ]);

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    measureContainer();
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const focal = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const delta = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    applyZoomDelta(delta, focal);
  }

  function handleDoubleClick(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const focal = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const nearFit = Math.abs(scale - fitScale) < 0.02;
    if (nearFit) {
      applyZoomDelta(ZOOM_STEP * ZOOM_STEP, focal);
      return;
    }
    applyFitToScreen();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panEnabled || event.pointerType === "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startPan: pan,
      origin: { x: event.clientX, y: event.clientY },
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextPan = clampPan(
      {
        x: drag.startPan.x + (event.clientX - drag.origin.x),
        y: drag.startPan.y + (event.clientY - drag.origin.y),
      },
      scale,
      naturalSize,
      containerSize
    );
    setPan(nextPan);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || !viewportRef.current) return;
    event.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const touches = Array.from(event.touches).map((touch) => ({
      clientX: touch.clientX,
      clientY: touch.clientY,
    }));
    pinchRef.current = {
      distance: distanceBetweenTouches(touches),
      scale,
      pan,
      midpoint: midpointBetweenTouches(touches, rect),
    };
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const distance = distanceBetweenTouches(
      Array.from(event.touches).map((touch) => ({
        clientX: touch.clientX,
        clientY: touch.clientY,
      }))
    );
    if (!distance || !pinch.distance) return;
    const ratio = distance / pinch.distance;
    const minScale = Math.max(fitScale * MIN_ZOOM_RATIO, 0.05);
    const maxScale = Math.max(fitScale * MAX_ZOOM_RATIO, 1);
    const nextScale = clamp(pinch.scale * ratio, minScale, maxScale);
    const result = zoomAroundPoint(
      pinch.scale,
      nextScale,
      pinch.pan,
      pinch.midpoint,
      containerSize,
      naturalSize
    );
    setScale(result.scale);
    setPan(result.pan);
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
  }

  const displayWidth = naturalSize.width * scale;
  const displayHeight = naturalSize.height * scale;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex flex-col bg-slate-950/95 backdrop-blur-sm"
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
            <h2 id={titleId} className="truncate text-sm font-medium text-white sm:text-base">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Close image viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div
            ref={viewportRef}
            className={clsx(
              "relative min-h-0 flex-1 touch-none select-none overflow-hidden",
              panEnabled && (dragging ? "cursor-grabbing" : "cursor-grab")
            )}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {failed ? (
                <p className="text-sm text-white/70">Could not load image.</p>
              ) : !url ? (
                <Loader2 className="h-10 w-10 animate-spin text-white/60" />
              ) : (
                <img
                  src={url}
                  alt={title}
                  onLoad={handleImageLoad}
                  draggable={false}
                  className="max-w-none shrink-0"
                  style={{
                    width: displayWidth > 0 ? `${displayWidth}px` : "auto",
                    height: displayHeight > 0 ? `${displayHeight}px` : "auto",
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                  }}
                />
              )}
            </div>
          </div>

          <footer className="shrink-0 border-t border-white/10 bg-slate-950/80 px-4 py-3 pb-safe sm:px-6">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<ZoomOut className="h-4 w-4" />}
                onClick={() => applyZoomDelta(1 / ZOOM_STEP)}
                disabled={!url || scale <= Math.max(fitScale * MIN_ZOOM_RATIO, 0.05)}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                Zoom out
              </Button>
              <span className="min-w-[4.5rem] text-center text-xs font-medium text-white/80">
                {zoomPercent}%
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<ZoomIn className="h-4 w-4" />}
                onClick={() => applyZoomDelta(ZOOM_STEP)}
                disabled={!url}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                Zoom in
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={applyReset100}
                disabled={!url}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                Reset (100%)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Maximize2 className="h-4 w-4" />}
                onClick={applyFitToScreen}
                disabled={!url}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                Fit to screen
              </Button>
            </div>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
