import { useCallback, useEffect, useRef, useState } from "react";

export type FacingMode = "user" | "environment";

/**
 * Drives a live camera preview and captures still frames as JPEG blobs.
 * Deliberately does NOT expose a file-picker fallback — the requirement is
 * that selfies must come from a live camera capture, not a gallery upload.
 * Supports switching between the front ("user") and rear ("environment") cameras.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("user");

  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return false;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    try {
      await video.play();
    } catch {
      // Autoplay can fail until metadata is ready; loadedmetadata handler retries.
    }

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return true;
    }

    await new Promise<void>((resolve) => {
      const onReady = () => {
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("playing", onReady);
        resolve();
      };
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("playing", onReady);
      // Safety: don't hang forever if the stream never produces frames.
      window.setTimeout(onReady, 2_000);
    });

    try {
      await video.play();
    } catch {
      // ignore — capture path will surface a clear error if still unusable
    }

    return video.videoWidth > 0 && video.videoHeight > 0;
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const start = useCallback(
    async (mode?: FacingMode) => {
      const requested = mode ?? "user";
      setError(null);
      // Release any previous stream before requesting a new one (needed when switching).
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setIsActive(false);

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera is not supported on this device/browser.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: requested, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        streamRef.current = stream;
        setFacingMode(requested);

        const ready = await attachStreamToVideo(stream);
        setIsActive(ready);
        if (!ready) {
          // Stream exists; keep trying when the video element mounts/binds.
          setIsActive(Boolean(stream.active));
        }
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access was denied. Please allow camera permissions to check in."
            : "Unable to access the camera on this device."
        );
        setIsActive(false);
      }
    },
    [attachStreamToVideo]
  );

  const switchCamera = useCallback(async () => {
    const next: FacingMode = facingMode === "user" ? "environment" : "user";
    await start(next);
  }, [facingMode, start]);

  // If the <video> mounts after getUserMedia resolves, attach the live stream once.
  useEffect(() => {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;
    if (video.srcObject === stream && isActive) return;

    let cancelled = false;
    void attachStreamToVideo(stream).then((ready) => {
      if (!cancelled && ready) setIsActive(true);
    });
    return () => {
      cancelled = true;
    };
  }, [attachStreamToVideo, facingMode, isActive]);

  useEffect(() => stop, [stop]);

  const capture = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      const stream = streamRef.current;
      if (!video || !stream) {
        reject(new Error("Camera is not active"));
        return;
      }
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        reject(new Error("Camera preview is not ready yet. Please wait a moment and try again."));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create capture context"));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to capture image"))),
        "image/jpeg",
        0.9
      );
    });
  }, []);

  return { videoRef, isActive, error, facingMode, start, stop, switchCamera, capture };
}
