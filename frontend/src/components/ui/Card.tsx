import type { HTMLAttributes, ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { quickTransition } from "@/lib/motion";

type CardProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd"
> & {
  /** Adds a subtle hover lift, for clickable/interactive card instances. */
  interactive?: boolean;
};

export function Card({ className, children, interactive = false, ...props }: CardProps) {
  if (interactive) {
    return (
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 8px 24px rgb(15 23 42 / 0.08)" }}
        transition={quickTransition}
        className={clsx("rounded-2xl border border-slate-200/80 bg-white shadow-soft-sm", className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      className={clsx("rounded-2xl border border-slate-200/80 bg-white shadow-soft-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("px-5 py-4", className)} {...props}>
      {children}
    </div>
  );
}
