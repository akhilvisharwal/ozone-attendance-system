import { cloneElement, isValidElement, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import type { NavItem } from "./AppLayout";
import { quickTransition } from "@/lib/motion";

function resizeIcon(icon: ReactNode, className: string): ReactNode {
  if (isValidElement<{ className?: string }>(icon)) {
    return cloneElement(icon, { className });
  }
  return icon;
}

/** Fixed bottom tab bar for the employee mobile experience — replaces the hamburger drawer below `lg`. */
export function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      className="bottom-nav-animate fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur-md lg:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                isActive ? "text-brand-600" : "text-slate-500 hover:text-slate-700"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="bottom-nav-active-indicator"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-600"
                    transition={quickTransition}
                  />
                )}
                <span
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center transition-transform",
                    isActive && "scale-110"
                  )}
                >
                  {resizeIcon(item.icon, "h-5 w-5")}
                </span>
                <span className="max-w-[4.5rem] truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
