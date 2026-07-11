import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-soft-xs hover:bg-brand-700 hover:shadow-soft-sm focus-visible:outline-brand-600 disabled:bg-brand-300 disabled:shadow-none",
  secondary:
    "bg-slate-900 text-white shadow-soft-xs hover:bg-slate-800 hover:shadow-soft-sm focus-visible:outline-slate-900 disabled:bg-slate-400 disabled:shadow-none",
  danger:
    "bg-red-600 text-white shadow-soft-xs hover:bg-red-700 hover:shadow-soft-sm focus-visible:outline-red-600 disabled:bg-red-300 disabled:shadow-none",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-300",
  outline:
    "bg-white text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 disabled:text-slate-300",
};

const sizeClasses: Record<Size, string> = {
  sm: "min-h-[44px] px-3 py-1.5 text-sm sm:min-h-[36px]",
  md: "min-h-11 px-4 py-2.5 text-sm sm:min-h-0 sm:py-2",
  lg: "min-h-[46px] px-5 py-2.5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150",
        "active:scale-[0.98]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:active:scale-100",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
