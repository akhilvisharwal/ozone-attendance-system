import { Loader2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
      <LogoMark variant="compact" />
      <div className="flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
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
