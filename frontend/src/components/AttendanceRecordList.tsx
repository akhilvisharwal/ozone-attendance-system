import type { ReactNode } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import type { AdminAttendanceRow } from "@/types";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import {
  AttendanceDayBadge,
  AttendanceStatusBadge,
  WorkStatusBadge,
} from "@/components/ui/Badge";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";
import { formatLocationSummary } from "@/utils/location";
import { quickTransition, staggerContainer, staggerItem } from "@/lib/motion";

export interface AttendanceRecordListProps {
  records: AdminAttendanceRow[];
  /** Zero-based index of the first record (for paginated serial numbers). */
  startIndex?: number;
  onRecordClick?: (record: AdminAttendanceRow) => void;
  showDate?: boolean;
  showLocations?: boolean;
  className?: string;
}

export function AttendanceRecordList({
  records,
  startIndex = 0,
  onRecordClick,
  showDate = true,
  showLocations = true,
  className,
}: AttendanceRecordListProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className={clsx("flex flex-col gap-3 p-4 lg:gap-3.5 lg:p-5", className)}
    >
      {records.map((record, index) => (
        <AttendanceRecordRow
          key={record.id}
          record={record}
          serialNumber={startIndex + index + 1}
          onClick={onRecordClick ? () => onRecordClick(record) : undefined}
          showDate={showDate}
          showLocations={showLocations}
        />
      ))}
    </motion.div>
  );
}

function AttendanceRecordRow({
  record,
  serialNumber,
  onClick,
  showDate,
  showLocations,
}: {
  record: AdminAttendanceRow;
  serialNumber: number;
  onClick?: () => void;
  showDate: boolean;
  showLocations: boolean;
}) {
  const clickable = Boolean(onClick);
  const checkInLocation = formatLocationSummary(
    record.check_in_address,
    record.check_in_latitude,
    record.check_in_longitude
  );
  const checkOutLocation = formatLocationSummary(
    record.check_out_address,
    record.check_out_latitude,
    record.check_out_longitude
  );

  return (
    <motion.article
      variants={staggerItem}
      whileHover={clickable ? { y: -2 } : undefined}
      transition={quickTransition}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={clsx(
        "flex w-full min-w-0 flex-col gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition-colors sm:flex-row sm:items-start sm:gap-5 lg:px-5 lg:py-4",
        clickable &&
          "cursor-pointer hover:border-slate-300 hover:bg-slate-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
      )}
    >
      <div className="flex min-w-0 shrink-0 gap-3 sm:w-52 md:w-56 lg:w-60">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200/80"
          aria-label={`Record ${serialNumber}`}
        >
          #{serialNumber}
        </span>
        <EmployeeAvatar
          name={record.employee_name}
          photoPath={record.employee_profile_photo_path}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{record.employee_name}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-400">{record.employee_code}</p>
          {record.employee_designation && (
            <p className="mt-0.5 text-xs text-slate-500">{record.employee_designation}</p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <AttendanceDayBadge
              dayStatus={record.day_status}
              specialDayStatus={record.special_day_status}
              adminMarkStatus={record.is_admin_marked ? record.admin_mark_status : null}
            />
          </div>
        </div>
      </div>

      <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
        {showDate && (
          <ListField label="Date">{formatDate(record.attendance_date)}</ListField>
        )}
        <ListField label="Check-in">{formatTime(record.check_in_time)}</ListField>
        <ListField label="Check-out">{formatTime(record.check_out_time)}</ListField>
        <ListField label="Hours">{formatMinutesAsHours(record.total_minutes)}</ListField>
        {showLocations && (
          <>
            <ListField label="Check-in Location" title={record.check_in_address ?? checkInLocation}>
              <span className="line-clamp-2 break-words">{checkInLocation}</span>
            </ListField>
            <ListField label="Check-out Location" title={record.check_out_address ?? checkOutLocation}>
              <span className="line-clamp-2 break-words">{checkOutLocation}</span>
            </ListField>
          </>
        )}
        <ListField label="Project" title={record.site_name ?? undefined}>
          <span className="truncate">{record.site_name ?? "—"}</span>
        </ListField>
        <ListField label="Work Status">
          <WorkStatusBadge status={record.work_status} />
        </ListField>
        <ListField label="Status">
          <AttendanceStatusBadge status={record.status} />
        </ListField>
      </dl>
    </motion.article>
  );
}

function ListField({
  label,
  children,
  title,
}: {
  label: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm font-medium leading-snug text-slate-700" title={title}>
        {children}
      </dd>
    </div>
  );
}
