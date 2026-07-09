import { MapPin } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SecureImage } from "@/components/SecureImage";
import { GoogleMapPreview } from "@/components/GoogleMapPreview";
import { WorkStatusBadge, AttendanceStatusBadge, AttendanceDayBadge } from "@/components/ui/Badge";
import type { AttendanceRecord, ManualAttendanceStatus } from "@/types";
import { formatDate, formatDateTime, formatMinutesAsHours, formatTime } from "@/utils/format";

interface DetailAttendance extends AttendanceRecord {
  employee_code?: string;
  employee_name?: string;
  employee_designation?: string | null;
  admin_marked_by_name?: string | null;
  admin_approved_by_name?: string | null;
}

function manualStatusLabel(status: ManualAttendanceStatus): string {
  const labels: Record<ManualAttendanceStatus, string> = {
    present: "Present",
    half_day: "Half Day",
    absent: "Absent",
    leave: "Leave",
    holiday: "Holiday",
    weekly_off: "Weekly Off",
  };
  return labels[status];
}

function LocationSection({
  title,
  time,
  address,
  latitude,
  longitude,
  accuracy,
}: {
  title: string;
  time: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy?: number | null;
}) {
  const hasCoords = latitude != null && longitude != null;

  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      <p className="text-sm text-slate-600">
        Time: {time ? formatDateTime(time) : "—"}
      </p>
      {address && (
        <p className="flex items-start gap-1.5 text-sm text-slate-500">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {address}
        </p>
      )}
      {hasCoords && (
        <p className="text-xs text-slate-400">
          Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          {accuracy != null ? ` · Accuracy: ${Math.round(accuracy)}m` : ""}
        </p>
      )}
      {!hasCoords && !address && (
        <p className="text-sm text-slate-400">No location recorded.</p>
      )}
      {hasCoords && (
        <GoogleMapPreview
          latitude={latitude}
          longitude={longitude}
          label={`${title} map`}
        />
      )}
    </section>
  );
}

export function AttendanceDetailModal({
  attendance,
  onClose,
  showLocationDetails = true,
}: {
  attendance: DetailAttendance | null;
  onClose: () => void;
  showLocationDetails?: boolean;
}) {
  return (
    <Modal open={!!attendance} onClose={onClose} title="Attendance Details" widthClassName="max-w-3xl">
      {attendance && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {attendance.employee_name && (
                <p className="text-base font-semibold text-slate-900">
                  {attendance.employee_name}{" "}
                  <span className="font-normal text-slate-400">({attendance.employee_code})</span>
                </p>
              )}
              {attendance.employee_designation && (
                <p className="text-sm text-slate-600">{attendance.employee_designation}</p>
              )}
              <p className="text-sm text-slate-500">{formatDate(attendance.attendance_date)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AttendanceDayBadge
                dayStatus={attendance.day_status}
                specialDayStatus={attendance.special_day_status}
                adminMarkStatus={attendance.is_admin_marked ? attendance.admin_mark_status : null}
              />
              <AttendanceStatusBadge status={attendance.status} />
              <WorkStatusBadge status={attendance.work_status} />
              {attendance.is_admin_marked && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                  Admin marked
                </span>
              )}
            </div>
          </div>

          {attendance.is_admin_marked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Manual attendance entry</p>
              {attendance.admin_mark_status && (
                <p className="mt-1">
                  Status: <span className="font-medium">{manualStatusLabel(attendance.admin_mark_status)}</span>
                </p>
              )}
              {attendance.admin_mark_reason && (
                <p className="mt-1">
                  Reason: <span className="font-medium">{attendance.admin_mark_reason}</span>
                </p>
              )}
              <p className="mt-1">
                Marked by{" "}
                <span className="font-medium">{attendance.admin_marked_by_name ?? "Admin"}</span>
                {attendance.admin_approved_by_name &&
                  attendance.admin_approved_by_name !== attendance.admin_marked_by_name && (
                    <> · Approved by {attendance.admin_approved_by_name}</>
                  )}
              </p>
            </div>
          )}

          {!attendance.is_admin_marked && attendance.admin_mark_reason && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <span className="font-medium">Admin note: </span>{attendance.admin_mark_reason}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <section className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-slate-700">Check-in</h4>
              <SecureImage
                path={attendance.check_in_selfie_path}
                alt="Check-in selfie"
                className="h-40 w-40 rounded-lg object-cover"
              />
              <p className="text-sm text-slate-600">Time: {formatTime(attendance.check_in_time)}</p>
              {attendance.check_in_device_info && (
                <p className="truncate text-xs text-slate-400" title={attendance.check_in_device_info}>
                  Device: {attendance.check_in_device_info}
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-slate-700">Check-out Summary</h4>
              <p className="text-sm text-slate-600">Time: {formatTime(attendance.check_out_time)}</p>
              <p className="text-sm text-slate-600">Total Hours: {formatMinutesAsHours(attendance.total_minutes)}</p>
            </section>
          </div>

          {showLocationDetails && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <LocationSection
                title="Check-in Location"
                time={attendance.check_in_time}
                address={attendance.check_in_address}
                latitude={attendance.check_in_latitude}
                longitude={attendance.check_in_longitude}
              />
              <LocationSection
                title="Check-out Location"
                time={attendance.check_out_time}
                address={attendance.check_out_address}
                latitude={attendance.check_out_latitude}
                longitude={attendance.check_out_longitude}
                accuracy={attendance.check_out_gps_accuracy}
              />
            </div>
          )}

          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-slate-700">Work Report</h4>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">Project / Site: </span>
              {attendance.site_name ?? "-"}
            </p>
            <p className="whitespace-pre-wrap text-sm text-slate-600">
              <span className="font-medium text-slate-700">Summary: </span>
              {attendance.work_summary ?? "-"}
            </p>
            {attendance.remarks && (
              <p className="whitespace-pre-wrap text-sm text-slate-600">
                <span className="font-medium text-slate-700">Remarks: </span>
                {attendance.remarks}
              </p>
            )}
          </section>

          {attendance.site_photo_paths?.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Site Photos</h4>
              <div className="flex flex-wrap gap-3">
                {attendance.site_photo_paths.map((path) => (
                  <SecureImage key={path} path={path} alt="Site photo" className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
