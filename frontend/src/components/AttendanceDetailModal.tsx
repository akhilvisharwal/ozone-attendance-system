import { MapPin } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SecureImage } from "@/components/SecureImage";
import { WorkStatusBadge, AttendanceStatusBadge, DayStatusBadge } from "@/components/ui/Badge";
import type { AttendanceRecord } from "@/types";
import { formatDate, formatMinutesAsHours, formatTime } from "@/utils/format";

function osmEmbedUrl(lat: number, lng: number): string {
  const delta = 0.004;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lng}&layer=mapnik`;
}

interface DetailAttendance extends AttendanceRecord {
  employee_code?: string;
  employee_name?: string;
}

export function AttendanceDetailModal({
  attendance,
  onClose,
}: {
  attendance: DetailAttendance | null;
  onClose: () => void;
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
              <p className="text-sm text-slate-500">{formatDate(attendance.attendance_date)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DayStatusBadge status={attendance.day_status} />
              <AttendanceStatusBadge status={attendance.status} />
              <WorkStatusBadge status={attendance.work_status} />
              {attendance.is_admin_marked && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                  Admin marked
                </span>
              )}
            </div>
          </div>

          {attendance.is_admin_marked && attendance.admin_mark_reason && (
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
              {attendance.check_in_address && (
                <p className="flex items-start gap-1.5 text-sm text-slate-500">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" /> {attendance.check_in_address}
                </p>
              )}
              {attendance.check_in_device_info && (
                <p className="truncate text-xs text-slate-400" title={attendance.check_in_device_info}>
                  Device: {attendance.check_in_device_info}
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-slate-700">Check-out</h4>
              <p className="text-sm text-slate-600">Time: {formatTime(attendance.check_out_time)}</p>
              <p className="text-sm text-slate-600">Total Hours: {formatMinutesAsHours(attendance.total_minutes)}</p>
              {attendance.check_out_address && (
                <p className="flex items-start gap-1.5 text-sm text-slate-500">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" /> {attendance.check_out_address}
                </p>
              )}
            </section>
          </div>

          {attendance.check_in_latitude && attendance.check_in_longitude && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Check-in Location</h4>
              <iframe
                title="Check-in location map"
                className="h-56 w-full rounded-lg border border-slate-200"
                src={osmEmbedUrl(attendance.check_in_latitude, attendance.check_in_longitude)}
              />
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-slate-700">Work Report</h4>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">Project / Site: </span>
              {attendance.site_name ?? "-"}
            </p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">
              <span className="font-medium text-slate-700">Summary: </span>
              {attendance.work_summary ?? "-"}
            </p>
            {attendance.remarks && (
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
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
