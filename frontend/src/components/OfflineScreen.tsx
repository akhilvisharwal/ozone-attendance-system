import { WifiOff } from "lucide-react";
import { LoadingScreen } from "@/components/LoadingScreen";

export function OfflineScreen({ reconnecting }: { reconnecting?: boolean }) {
  if (reconnecting) {
    return <LoadingScreen label="Connection restored. Verifying your session…" />;
  }

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <WifiOff className="h-7 w-7" aria-hidden />
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-semibold text-slate-900">You are offline</h1>
        <p className="text-sm text-slate-600">
          Check your internet connection. This page will verify your session automatically when you are back
          online.
        </p>
      </div>
    </div>
  );
}
