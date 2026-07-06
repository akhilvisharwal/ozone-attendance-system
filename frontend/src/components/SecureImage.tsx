import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { fetchSecureFileUrl } from "@/api/client";

/**
 * Renders an uploaded selfie / site photo. Files are served behind an
 * authenticated API endpoint (so employees cannot view each other's images
 * by guessing URLs), so we fetch the bytes with the access token attached
 * and render them via a local object URL.
 */
export function SecureImage({
  path,
  alt,
  className,
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) return;
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
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className ?? ""}`}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className ?? ""}`}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <img src={url} alt={alt} className={className} />;
}
