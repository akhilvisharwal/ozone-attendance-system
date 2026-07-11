import type { ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { staggerContainer, staggerItem } from "@/lib/motion";

export interface Column<T> {
  /** Column header text */
  header: string;
  /** Cell renderer */
  cell: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  /** Hide this column on the mobile card view */
  mobileHidden?: boolean;
  /** Use this column as the mobile card title (rendered without a label) */
  primary?: boolean;
  /** Extra classes for the desktop <td>/<th> */
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Optional trailing actions cell (e.g. an overflow menu) */
  actions?: (row: T) => ReactNode;
}

const alignClass: Record<NonNullable<Column<never>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function ResponsiveTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  actions,
}: ResponsiveTableProps<T>) {
  const clickable = Boolean(onRowClick);

  return (
    <>
      {/* Desktop / tablet: real table with horizontal scroll fallback */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className={clsx("px-4 py-3 lg:px-5", col.align && alignClass[col.align])}>
                  {col.header}
                </th>
              ))}
              {actions && (
                <th className="sticky right-0 z-10 bg-white px-4 py-3 text-right shadow-[-8px_0_12px_-12px_rgb(15_23_42/0.35)] lg:px-5">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <motion.tbody
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="divide-y divide-slate-100"
          >
            {data.map((row, index) => (
              <motion.tr
                key={rowKey(row, index)}
                variants={staggerItem}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick && !actions
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                role={clickable && !actions ? "button" : undefined}
                tabIndex={clickable && !actions ? 0 : undefined}
                className={clsx("transition-colors", clickable && "cursor-pointer hover:bg-slate-50/80")}
              >
                {columns.map((col, i) => (
                  <td
                    key={i}
                    className={clsx(
                      "px-4 py-3 align-top text-slate-600 lg:px-5",
                      col.align && alignClass[col.align],
                      col.className
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td
                    className="sticky right-0 bg-white px-4 py-3 text-right shadow-[-8px_0_12px_-12px_rgb(15_23_42/0.35)] lg:px-5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end">{actions(row)}</div>
                  </td>
                )}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="divide-y divide-slate-100 md:hidden"
      >
        {data.map((row, index) => {
          const primary = columns.find((c) => c.primary);
          const rest = columns.filter((c) => !c.primary && !c.mobileHidden);
          return (
            <motion.div
              key={rowKey(row, index)}
              variants={staggerItem}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick && !actions
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              role={clickable && !actions ? "button" : undefined}
              tabIndex={clickable && !actions ? 0 : undefined}
              className={clsx(
                "flex flex-col gap-2 px-4 py-4 transition-colors",
                clickable && "cursor-pointer active:bg-slate-50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {primary ? (
                    <div className="text-sm font-semibold text-slate-900">{primary.cell(row)}</div>
                  ) : (
                    rest[0] && (
                      <div className="text-sm font-semibold text-slate-900">{rest[0].cell(row)}</div>
                    )
                  )}
                </div>
                {actions && (
                  <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </div>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {(primary ? rest : rest.slice(1)).map((col, i) => (
                  <div key={i} className="min-w-0">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {col.header}
                    </dt>
                    <dd className="break-words text-sm text-slate-700">{col.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
}

/** Responsive filter/toolbar wrapper: stacks full-width on mobile, inline row on sm+. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:flex sm:flex-wrap sm:items-end">
      {children}
    </div>
  );
}
