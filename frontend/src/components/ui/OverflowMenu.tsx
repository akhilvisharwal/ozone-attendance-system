import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MoreVertical } from "lucide-react";
import clsx from "clsx";
import { panelVariants } from "@/lib/motion";

export interface OverflowMenuItem {
  label: string;
  icon?: ReactNode;
  /** Red colour for destructive actions */
  danger?: boolean;
  /** Greyed-out and non-interactive */
  disabled?: boolean;
  /** Short tooltip text shown inside the row when disabled */
  disabledReason?: string;
  onClick?: () => void;
  /** Horizontal rule rendered above this item */
  divider?: boolean;
}

interface Props {
  items: OverflowMenuItem[];
  /** Which edge of the button the panel aligns to (default: right) */
  align?: "right" | "left";
}

interface DropdownPos {
  /** Fixed top or bottom coordinate in px */
  top?: number;
  bottom?: number;
  /** Fixed left or right coordinate in px */
  left?: number;
  right?: number;
}

const MENU_WIDTH = 216; // px — min-width of the dropdown

export function OverflowMenu({ items, align = "right" }: Props) {
  const [open, setOpen]       = useState(false);
  const [pos, setPos]         = useState<DropdownPos>({});
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /** Calculate viewport-relative position and open/close direction. */
  const calcPos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Approximate height: 5 items × 40 px + dividers + padding
    const approxMenuH = items.length * 41 + items.filter((i) => i.divider).length * 9 + 8;
    const openUp = r.bottom + approxMenuH > vh - 16 && r.top > approxMenuH;

    const next: DropdownPos = {};

    // Vertical
    if (openUp) {
      next.bottom = vh - r.top + 4;
    } else {
      next.top = r.bottom + 4;
    }

    // Horizontal — align the panel to the requested edge of the button
    if (align === "right") {
      // right edge of panel = right edge of button
      next.right = vw - r.right;
    } else {
      // left edge of panel = left edge of button
      next.left = r.left;
    }

    // Safety: don't let the panel overflow the viewport left edge
    if (next.left !== undefined && next.left + MENU_WIDTH > vw) {
      next.left = vw - MENU_WIDTH - 8;
    }
    if (next.right !== undefined && next.right + MENU_WIDTH > vw) {
      next.right = vw - MENU_WIDTH - 8;
    }

    setPos(next);
  }, [items, align]);

  function handleToggle() {
    if (!open) {
      calcPos();
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  // Outside-click — check both the trigger button and the floating panel
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        btnRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, calcPos]);

  const dropdown = ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            zIndex: 9999,
            minWidth: MENU_WIDTH,
            ...pos,
          }}
          variants={panelVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="rounded-2xl bg-white py-1 shadow-soft-lg ring-1 ring-slate-900/10"
        >
          {items.map((item, idx) => (
            <div key={idx}>
              {item.divider && (
                <div className="my-1 border-t border-slate-100" />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.disabled ? item.disabledReason : undefined}
                onClick={() => {
                  if (!item.disabled) {
                    setOpen(false);
                    item.onClick?.();
                  }
                }}
                className={clsx(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left",
                  item.disabled
                    ? "cursor-not-allowed text-slate-300"
                    : item.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-slate-700 hover:bg-slate-50"
                )}
              >
                {item.icon && (
                  <span
                    className={clsx(
                      "flex-shrink-0 w-4 h-4",
                      item.disabled
                        ? "text-slate-300"
                        : item.danger
                        ? "text-red-400"
                        : "text-slate-400"
                    )}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
                {item.disabled && item.disabledReason && (
                  <span className="ml-2 text-[10px] text-slate-300 leading-tight">
                    {item.disabledReason}
                  </span>
                )}
              </button>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
        <span className="sr-only">Open menu</span>
      </button>
      {dropdown}
    </>
  );
}
