import { useState } from "react";
import { FileText, Loader2, ZoomIn } from "lucide-react";
import clsx from "clsx";
import { fetchSecureFileUrl } from "@/api/client";
import { SecureImage } from "@/components/SecureImage";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

export function isPdfPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.toLowerCase().split("?")[0].endsWith(".pdf");
}

export function isImagePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const lower = path.toLowerCase().split("?")[0];
  return [".jpg", ".jpeg", ".png", ".webp"].some((ext) => lower.endsWith(ext));
}

/** Thumbnail / link that opens image zoom modal or PDF in a new tab. */
export function ReceiptThumbnail({
  path,
  className,
  sizeClassName = "h-20 w-20",
}: {
  path: string | null | undefined;
  className?: string;
  sizeClassName?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [openingPdf, setOpeningPdf] = useState(false);

  if (!path) return null;

  const pdf = isPdfPath(path);

  async function openPdf() {
    if (openingPdf) return;
    setOpeningPdf(true);
    try {
      const url = await fetchSecureFileUrl(path!);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // ignore — user can retry
    } finally {
      setOpeningPdf(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (pdf) void openPdf();
          else setPreviewOpen(true);
        }}
        className={clsx(
          "group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-brand-300 hover:ring-2 hover:ring-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          sizeClassName,
          className
        )}
        title={pdf ? "Open PDF receipt" : "Preview receipt"}
        aria-label={pdf ? "Open PDF receipt" : "Preview receipt image"}
        disabled={openingPdf}
      >
        {pdf ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-600">
            {openingPdf ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <FileText className="h-7 w-7 text-red-600" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wide">PDF</span>
          </div>
        ) : (
          <>
            <SecureImage path={path} alt="Receipt" className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/35 group-hover:opacity-100">
              <ZoomIn className="h-5 w-5 text-white" />
            </span>
          </>
        )}
      </button>

      {!pdf && (
        <ImageLightbox
          open={previewOpen}
          path={path}
          title="Receipt preview"
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
