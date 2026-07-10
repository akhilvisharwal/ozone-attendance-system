import { useState } from "react";
import { ZoomIn } from "lucide-react";
import clsx from "clsx";
import { SecureImage } from "@/components/SecureImage";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

export function AttendancePhotoThumbnail({
  path,
  alt,
  sizeClassName = "h-28 w-28",
  className,
}: {
  path: string;
  alt: string;
  sizeClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "group relative overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 text-left transition",
          "hover:border-brand-300 hover:ring-2 hover:ring-brand-100",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          sizeClassName,
          className
        )}
        aria-label={`View full-size ${alt}`}
      >
        <SecureImage path={path} alt={alt} className="h-full w-full object-cover" fallback="hide" />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/35 group-hover:opacity-100 group-focus-visible:bg-slate-900/35 group-focus-visible:opacity-100">
          <ZoomIn className="h-5 w-5 text-white" />
        </span>
      </button>

      <ImageLightbox open={open} path={path} title={alt} onClose={() => setOpen(false)} />
    </>
  );
}
