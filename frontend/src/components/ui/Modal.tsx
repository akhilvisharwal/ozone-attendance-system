import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

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
        "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3",
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
  layout = "sheet",
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
  /** Which element receives focus when the modal opens. */
  initialFocus?: "first" | "none";
  /** `centered` keeps the dialog centered on all screen sizes; `sheet` slides up on mobile. */
  layout?: "sheet" | "centered";
  /** Tighter header/body padding for confirmation-style dialogs. */
  compact?: boolean;
  /** Optional footer region with its own padding, separated from the body. */
  footer?: ReactNode;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
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
    if (!open || !panelRef.current) return;

    function onKeyDown(e: KeyboardEvent) {
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
  }, [open]);

  if (!open) return null;

  const hasFooter = Boolean(footer);
  const padX = compact ? "px-5" : "px-6";
  const headerPad = compact ? `${padX} py-4` : `${padX} pt-6 pb-4`;

  const bodyPad =
    bodyClassName
    ?? (hasFooter
      ? `${padX} pt-5 pb-5`
      : compact
        ? `${padX} pt-4 pb-6-safe`
        : `${padX} pt-5 pb-8-safe`);

  const footerPad =
    footerClassName
    ?? clsx(
      "shrink-0 border-t border-slate-100 bg-white",
      compact ? `${padX} pt-4 pb-6-safe` : `${padX} pt-5 pb-8-safe`
    );

  return (
    <div
      className={clsx(
        "modal-backdrop-animate fixed inset-0 z-50 flex justify-center bg-slate-900/45 backdrop-blur-[3px]",
        layout === "centered" ? "items-center p-4" : "items-end p-0 sm:items-center sm:p-4"
      )}
      aria-hidden="true"
    >
      <div
        ref={panelRef}
        className={clsx(
          "modal-panel-animate flex max-h-[min(92vh,640px)] w-full flex-col overflow-hidden bg-white outline-none",
          "shadow-2xl ring-1 ring-slate-900/5",
          layout === "centered" ? "rounded-xl" : "rounded-t-2xl sm:rounded-xl",
          widthClassName
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className={clsx("shrink-0 border-b border-slate-100", headerPad)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={titleId} className={clsx("font-semibold text-slate-900", compact ? "text-sm" : "text-base")}>
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
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className={clsx("min-h-0 flex-1 overflow-y-auto overscroll-contain", bodyPad)}>
          {children}
        </div>

        {footer && (
          <div className={footerPad} role="contentinfo" aria-label="Modal actions">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
