import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ImageOff, Loader2 } from "lucide-react";
import { fetchSecureFileUrl } from "@/api/client";

/**
 * Renders an authenticated file (profile photo, selfie, receipt, etc.).
 * Never throws — failed loads fall back to icon or nothing.
 */
export function SecureImage({
  path,
  alt,
  className,
  fallback = "icon",
  onLoadError,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  /** When missing or failed: `icon` shows placeholder, `hide` renders nothing. */
  fallback?: "icon" | "hide";
  onLoadError?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(path));
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setFailed(false);
    setLoading(true);
    setUrl(null);

    fetchSecureFileUrl(path)
      .then((resolved) => {
        if (cancelled) {
          URL.revokeObjectURL(resolved);
          return;
        }
        objectUrl = resolved;
        setUrl(resolved);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
          onLoadErrorRef.current?.();
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!path || failed) {
    if (fallback === "hide") return null;
    return (
      <div
        className={clsx(
          "flex items-center justify-center bg-slate-100 text-slate-300",
          className
        )}
      >
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  if (loading || !url) {
    if (fallback === "hide") {
      return (
        <div className={clsx("flex items-center justify-center bg-transparent", className)} aria-hidden>
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        </div>
      );
    }
    return (
      <div
        className={clsx(
          "flex items-center justify-center bg-slate-100 text-slate-300",
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => {
        setFailed(true);
        onLoadErrorRef.current?.();
      }}
    />
  );
}
