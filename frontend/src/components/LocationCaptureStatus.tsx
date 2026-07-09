import { MapPin } from "lucide-react";

export function LocationCaptureStatus({
  loading,
  captured,
  error,
  onRetry,
  successLabel = "Location captured successfully",
}: {
  loading: boolean;
  captured: boolean;
  error: string | null;
  onRetry?: () => void;
  successLabel?: string;
}) {
  if (captured) {
    return (
      <p className="text-center text-sm font-medium text-emerald-600">{successLabel}</p>
    );
  }

  if (error) {
    return (
      <p className="flex flex-wrap items-center justify-center gap-2 text-center text-sm text-red-600">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="font-medium underline disabled:opacity-50"
          >
            Retry
          </button>
        )}
      </p>
    );
  }

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-center text-sm text-slate-500">
        <MapPin className="h-4 w-4 flex-shrink-0 animate-pulse" aria-hidden="true" />
        Detecting location...
      </p>
    );
  }

  return null;
}

export const GPS_WEAK_MESSAGE =
  "GPS signal is too weak. Please move to an open area and try again.";

export const GPS_REQUIRED_MESSAGE =
  "Unable to detect your location. Please enable location services and try again.";
