import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  cropImageToBlob,
  defaultSquareCrop,
  loadImageFromFile,
  validateProfilePhotoFile,
} from "@/utils/profilePhoto";

type CropState = { x: number; y: number; size: number };

export function ProfilePhotoCropModal({
  open,
  file,
  onClose,
  onConfirm,
  saving = false,
}: {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  saving?: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; crop: CropState } | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !file) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setImage(null);
      setObjectUrl(null);
      setCrop(null);
      setError(null);
      setDragging(false);
      dragOrigin.current = null;
      return;
    }

    const validation = validateProfilePhotoFile(file);
    if (validation) {
      setError(validation);
      setImage(null);
      setObjectUrl(null);
      setCrop(null);
      return;
    }

    let cancelled = false;
    loadImageFromFile(file)
      .then(({ image: img, objectUrl: url }) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        setObjectUrl(url);
        setImage(img);
        setCrop(defaultSquareCrop(img.naturalWidth, img.naturalHeight));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load image.");
          setImage(null);
          setCrop(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, file]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const display = useMemo(() => {
    if (!image || !image.naturalWidth || !image.naturalHeight) {
      return { scale: 1, width: 320, height: 320 };
    }
    const maxW = 320;
    const maxH = 320;
    const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight, 1);
    return {
      scale,
      width: Math.max(1, image.naturalWidth * scale),
      height: Math.max(1, image.naturalHeight * scale),
    };
  }, [image]);

  const scale = display.scale || 1;

  function clampCrop(next: CropState, img: HTMLImageElement): CropState {
    const maxSize = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(Math.max(40, next.size), maxSize);
    const x = Math.min(Math.max(0, next.x), Math.max(0, img.naturalWidth - size));
    const y = Math.min(Math.max(0, next.y), Math.max(0, img.naturalHeight - size));
    return { x, y, size };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!crop) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragOrigin.current = { pointerX: e.clientX, pointerY: e.clientY, crop };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || !dragOrigin.current || !image) return;
    const dx = (e.clientX - dragOrigin.current.pointerX) / scale;
    const dy = (e.clientY - dragOrigin.current.pointerY) / scale;
    setCrop(
      clampCrop(
        {
          ...dragOrigin.current.crop,
          x: dragOrigin.current.crop.x + dx,
          y: dragOrigin.current.crop.y + dy,
        },
        image
      )
    );
  }

  function onPointerUp() {
    setDragging(false);
    dragOrigin.current = null;
  }

  function zoom(delta: number) {
    if (!image || !crop) return;
    const nextSize = crop.size * (1 + delta);
    const cx = crop.x + crop.size / 2;
    const cy = crop.y + crop.size / 2;
    const size = Math.min(
      Math.max(40, nextSize),
      Math.min(image.naturalWidth, image.naturalHeight)
    );
    setCrop(
      clampCrop(
        {
          size,
          x: cx - size / 2,
          y: cy - size / 2,
        },
        image
      )
    );
  }

  async function handleConfirm() {
    if (!image || !crop || saving) return;
    setError(null);
    try {
      const blob = await cropImageToBlob(image, crop);
      await onConfirm(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the cropped photo.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title="Crop profile picture"
      description="Drag to reposition. Use zoom to frame your face, then save."
      widthClassName="max-w-md"
      footer={
        <ModalFooterActions>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            isLoading={saving}
            disabled={!image || !crop || Boolean(error && !image)}
          >
            Save photo
          </Button>
        </ModalFooterActions>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex justify-center rounded-xl bg-slate-100 p-4">
          {image && crop && objectUrl ? (
            <div
              className="relative overflow-hidden rounded-lg bg-slate-200 shadow-inner"
              style={{ width: display.width, height: display.height }}
            >
              <img
                src={objectUrl}
                alt="Crop preview"
                draggable={false}
                className="block h-full w-full select-none object-contain"
              />
              <div
                className="absolute cursor-move rounded-full border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]"
                style={{
                  left: crop.x * scale,
                  top: crop.y * scale,
                  width: crop.size * scale,
                  height: crop.size * scale,
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          ) : (
            <div className="flex h-48 w-full items-center justify-center text-sm text-slate-400">
              {error ? "Unable to preview this image." : "Loading image…"}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => zoom(0.12)} disabled={!crop || saving}>
            Zoom in
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => zoom(-0.12)} disabled={!crop || saving}>
            Zoom out
          </Button>
        </div>
      </div>
    </Modal>
  );
}
