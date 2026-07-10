import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  description,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Alias for subtitle */
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const sub = subtitle ?? description;
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 shadow-soft-xs">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-slate-500 sm:mt-1">{sub}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
