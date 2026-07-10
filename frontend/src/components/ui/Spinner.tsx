import { Loader2 } from "lucide-react";

/** Compact inline loader for page content areas (never full-screen). */
export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-12 text-slate-400"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Lightweight skeleton placeholder for list/table content while data loads. */
export function ContentSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 p-4 sm:p-5" role="status" aria-label="Loading content">
      <div className="h-4 w-1/3 max-w-[12rem] rounded bg-slate-200" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center text-slate-400">
      <span className="text-sm font-medium text-slate-500">{title}</span>
      {description && <span className="text-xs">{description}</span>}
    </div>
  );
}
