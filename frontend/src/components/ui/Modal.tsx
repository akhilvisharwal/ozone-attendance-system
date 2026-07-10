import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import clsx from "clsx";
import { backdropVariants, modalPanelVariants } from "@/lib/motion";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Standard action-button row for modal footers. */
export function ModalFooterActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex min-h-11 w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  widthClassName = "max-w-lg",
  showCloseButton = true,
  initialFocus = "first",
  layout = "centered",
  compact = false,
  footer,
  bodyClassName,
  footerClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  widthClassName?: string;
  showCloseButton?: boolean;
  initialFocus?: "first" | "none";
  layout?: "sheet" | "centered";
  compact?: boolean;
  footer?: ReactNode;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panelRef.current || initialFocus === "none") return;

    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null);

    const target = focusable[0] ?? panelRef.current;
    requestAnimationFrame(() => target.focus());
  }, [open, initialFocus]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const hasFooter = Boolean(footer);
  const padX = compact ? "px-5" : "px-6";
  const headerPad = compact ? `${padX} py-4` : `${padX} pt-5 pb-3.5`;

  const bodyPad =
    bodyClassName
    ?? (hasFooter
      ? `${padX} pt-4 pb-5`
      : compact
        ? `${padX} pt-3.5 pb-6-safe`
        : `${padX} pt-4 pb-6-safe`);

  const footerPad =
    footerClassName
    ?? clsx(
      "shrink-0 border-t border-slate-100 bg-white",
      padX,
      "flex min-h-[5.5rem] items-center pt-5 pb-6-safe"
    );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-slate-900/45 backdrop-blur-[3px]"
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            className={clsx(
              "pointer-events-none flex min-h-full justify-center px-4 py-6 sm:px-6 sm:py-10",
              layout === "sheet" ? "items-end sm:items-center" : "items-center"
            )}
          >
            <motion.div
              ref={panelRef}
              variants={modalPanelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={clsx(
                "pointer-events-auto relative flex w-full max-h-[min(90vh,calc(100dvh-3rem))] flex-col overflow-hidden bg-white outline-none",
                "shadow-soft-lg ring-1 ring-slate-900/5",
                layout === "centered" ? "rounded-2xl" : "rounded-t-2xl sm:rounded-2xl",
                widthClassName
              )}
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descriptionId : undefined}
              tabIndex={-1}
            >
              <div className={clsx("shrink-0 border-b border-slate-100", headerPad)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 pr-1">
                    <h3
                      id={titleId}
                      className={clsx("font-semibold text-slate-900", compact ? "text-sm" : "text-base")}
                    >
                      {title}
                    </h3>
                    {description && (
                      <p id={descriptionId} className="mt-0.5 text-sm text-slate-500">
                        {description}
                      </p>
                    )}
                  </div>
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>

              <div className={clsx("min-h-0 flex-1 overflow-y-auto overscroll-contain", bodyPad)}>
                {children}
              </div>

              {footer && (
                <div className={footerPad} role="contentinfo" aria-label="Modal actions">
                  <div className="w-full">{footer}</div>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
