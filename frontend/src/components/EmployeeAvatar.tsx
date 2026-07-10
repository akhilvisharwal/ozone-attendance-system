import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Camera } from "lucide-react";
import { SecureImage } from "@/components/SecureImage";

const PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const SIZE_CLASS = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-20 w-20 text-xl",
  "2xl": "h-28 w-28 text-2xl",
} as const;

export type EmployeeAvatarSize = keyof typeof SIZE_CLASS;

export function EmployeeAvatar({
  name,
  photoPath,
  size = "md",
  className,
  editable = false,
  onEditClick,
  title,
}: {
  name: string;
  photoPath?: string | null;
  size?: EmployeeAvatarSize;
  className?: string;
  editable?: boolean;
  onEditClick?: () => void;
  title?: string;
}) {
  const displayName = name?.trim() || "User";
  const [imageFailed, setImageFailed] = useState(false);
  const handleLoadError = useCallback(() => setImageFailed(true), []);

  useEffect(() => {
    setImageFailed(false);
  }, [photoPath]);

  const showPhoto = Boolean(photoPath) && !imageFailed;

  const shell = (
    <div
      className={clsx(
        "relative inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200/80",
        SIZE_CLASS[size],
        className
      )}
      title={title ?? displayName}
    >
      <span
        className={clsx(
          "absolute inset-0 flex items-center justify-center font-semibold",
          colorForName(displayName)
        )}
      >
        {getInitials(displayName)}
      </span>
      {showPhoto && photoPath ? (
        <SecureImage
          key={photoPath}
          path={photoPath}
          alt={displayName}
          className="absolute inset-0 h-full w-full object-cover"
          fallback="hide"
          onLoadError={handleLoadError}
        />
      ) : null}
      {editable && (
        <span className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/45 group-hover:opacity-100">
          <Camera className="h-4 w-4 text-white drop-shadow sm:h-5 sm:w-5" />
        </span>
      )}
    </div>
  );

  if (editable && onEditClick) {
    return (
      <button
        type="button"
        onClick={onEditClick}
        className="group relative inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        aria-label="Change profile picture"
      >
        {shell}
      </button>
    );
  }

  return shell;
}
