import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import clsx from "clsx";
import { fetchSecureFileUrl } from "@/api/client";

/**
 * Renders an uploaded selfie / site photo. Files are served behind an
 * authenticated API endpoint, so we fetch bytes with the access token and
 * render via a local object URL.
 */
export function SecureImage({
  path,
  alt,
  className,
  fallback = "icon",
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  /** When missing or failed: `icon` shows placeholder, `hide` renders nothing. */
  fallback?: "icon" | "hide";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setFailed(false);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;

    setFailed(false);
    setUrl(null);

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

  if (!url) {
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

  return <img src={url} alt={alt} className={className} />;
}
