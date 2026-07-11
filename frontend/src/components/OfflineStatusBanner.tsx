import { WifiOff } from "lucide-react";

export function OfflineStatusBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      <span className="inline-flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        You are offline. Reconnect to sync changes and verify your session.
      </span>
    </div>
  );
}
