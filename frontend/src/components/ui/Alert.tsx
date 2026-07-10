import clsx from "clsx";
import type { ComponentType, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type AlertVariant = "error" | "success" | "info";

const styles: Record<AlertVariant, { wrapper: string; icon: ComponentType<{ className?: string }> }> = {
  error: { wrapper: "bg-red-50 text-red-700 ring-red-600/20", icon: AlertCircle },
  success: { wrapper: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: CheckCircle2 },
  info: { wrapper: "bg-blue-50 text-blue-700 ring-blue-600/20", icon: Info },
};

export function Alert({
  variant = "info",
  children,
  onClose,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const { wrapper, icon: Icon } = styles[variant];
  return (
    <div
      className={clsx(
        "flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset",
        wrapper,
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} className="ml-auto -mr-0.5 flex-shrink-0 rounded p-0.5 opacity-70 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
