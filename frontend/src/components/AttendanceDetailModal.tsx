import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { AttendancePhotoThumbnail } from "@/components/AttendancePhotoThumbnail";
import { GoogleMapPreview } from "@/components/GoogleMapPreview";
import { Badge, WorkStatusBadge, AttendanceStatusBadge, AttendanceDayBadge } from "@/components/ui/Badge";
import type { AttendanceRecord, ManualAttendanceStatus } from "@/types";
import { splitAttendancePhotos } from "@/utils/attendancePhotos";
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
    holiday_worked: "Worked on Holiday",
    weekly_off_worked: "Worked on Weekly Off",
    not_applicable: "Not Applicable",
  };
  return labels[status];
}

function hasLocationData(
  address: string | null,
  latitude: number | null,
  longitude: number | null
): boolean {
  return Boolean(address || (latitude != null && longitude != null));
}

function InfoCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 px-3.5 py-3">
      {children}
    </div>
  );
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
  if (!hasLocationData(address, latitude, longitude)) return null;

  const hasCoords = latitude != null && longitude != null;

  return (
    <InfoCard>
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        {time && <p className="text-sm text-slate-600">Time: {formatDateTime(time)}</p>}
        {address && (
          <p className="flex items-start gap-1.5 text-sm text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {address}
          </p>
        )}
        {hasCoords && (
          <>
            <p className="text-xs text-slate-400">
              {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
              {accuracy != null ? ` · ±${Math.round(accuracy)}m` : ""}
            </p>
            <GoogleMapPreview latitude={latitude!} longitude={longitude!} label={`${title} map`} compact />
          </>
        )}
      </section>
    </InfoCard>
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
  const photos = attendance
    ? splitAttendancePhotos({
        check_in_selfie_path: attendance.check_in_selfie_path,
        site_photo_paths: attendance.site_photo_paths,
      })
    : { checkInPhoto: null, checkOutPhoto: null, sitePhotos: [] };
  const hasCheckIn = Boolean(
    attendance?.check_in_time || photos.checkInPhoto || attendance?.check_in_device_info
  );
  const hasCheckOut = Boolean(
    attendance?.check_out_time ||
      photos.checkOutPhoto ||
      (attendance?.total_minutes != null && attendance.total_minutes > 0)
  );
  const hasWorkReport = Boolean(
    attendance?.site_name || attendance?.work_summary || attendance?.remarks
  );
  const hasCheckInLocation = attendance
    ? hasLocationData(
        attendance.check_in_address,
        attendance.check_in_latitude,
        attendance.check_in_longitude
      )
    : false;
  const hasCheckOutLocation = attendance
    ? hasLocationData(
        attendance.check_out_address,
        attendance.check_out_latitude,
        attendance.check_out_longitude
      )
    : false;
  const showLocations =
    showLocationDetails && (hasCheckInLocation || hasCheckOutLocation);

  return (
    <Modal
      open={!!attendance}
      onClose={onClose}
      title="Attendance Details"
      widthClassName="max-w-2xl"
      layout="centered"
    >
      {attendance && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
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
            <div className="flex flex-wrap items-center gap-1.5">
              <AttendanceDayBadge
                dayStatus={attendance.day_status}
                specialDayStatus={attendance.special_day_status}
                adminMarkStatus={attendance.is_admin_marked ? attendance.admin_mark_status : null}
              />
              <AttendanceStatusBadge status={attendance.status} />
              <WorkStatusBadge status={attendance.work_status} />
              {attendance.is_admin_marked && <Badge tone="amber">Admin marked</Badge>}
            </div>
          </div>

          {attendance.is_admin_marked && (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3.5 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Manual attendance entry</p>
              <div className="mt-1.5 space-y-0.5">
                {attendance.admin_mark_status && (
                  <p>
                    Status:{" "}
                    <span className="font-medium">{manualStatusLabel(attendance.admin_mark_status)}</span>
                  </p>
                )}
                {attendance.admin_mark_reason && (
                  <p>
                    Reason: <span className="font-medium">{attendance.admin_mark_reason}</span>
                  </p>
                )}
                <p>
                  Marked by{" "}
                  <span className="font-medium">{attendance.admin_marked_by_name ?? "Admin"}</span>
                  {attendance.admin_approved_by_name &&
                    attendance.admin_approved_by_name !== attendance.admin_marked_by_name && (
                      <> · Approved by {attendance.admin_approved_by_name}</>
                    )}
                </p>
              </div>
            </div>
          )}

          {!attendance.is_admin_marked && attendance.admin_mark_reason && (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-sm text-amber-800">
              <span className="font-medium">Admin note: </span>
              {attendance.admin_mark_reason}
            </div>
          )}

          {(hasCheckIn || hasCheckOut) && (
            <div
              className={
                hasCheckIn && hasCheckOut
                  ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                  : "grid grid-cols-1 gap-3"
              }
            >
              {hasCheckIn && (
                <InfoCard>
                  <section className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">Check-in</h4>
                    {photos.checkInPhoto && (
                      <AttendancePhotoThumbnail
                        path={photos.checkInPhoto}
                        alt="Check-in photo"
                      />
                    )}
                    {attendance.check_in_time && (
                      <p className="text-sm text-slate-600">Time: {formatTime(attendance.check_in_time)}</p>
                    )}
                    {attendance.check_in_device_info && (
                      <p
                        className="truncate text-xs text-slate-400"
                        title={attendance.check_in_device_info}
                      >
                        Device: {attendance.check_in_device_info}
                      </p>
                    )}
                  </section>
                </InfoCard>
              )}

              {hasCheckOut && (
                <InfoCard>
                  <section className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">Check-out</h4>
                    {photos.checkOutPhoto && (
                      <AttendancePhotoThumbnail
                        path={photos.checkOutPhoto}
                        alt="Check-out photo"
                      />
                    )}
                    {attendance.check_out_time && (
                      <p className="text-sm text-slate-600">
                        Time: {formatTime(attendance.check_out_time)}
                      </p>
                    )}
                    {attendance.total_minutes != null && (
                      <p className="text-sm text-slate-600">
                        Total hours: {formatMinutesAsHours(attendance.total_minutes)}
                      </p>
                    )}
                  </section>
                </InfoCard>
              )}
            </div>
          )}

          {!hasCheckIn && !hasCheckOut && attendance.is_admin_marked && (
            <InfoCard>
              <p className="text-sm text-slate-600">
                Manual entry — no check-in or check-out times recorded.
              </p>
            </InfoCard>
          )}

          {showLocations && (
            <div
              className={
                hasCheckInLocation && hasCheckOutLocation
                  ? "grid grid-cols-1 gap-3 lg:grid-cols-2"
                  : "grid grid-cols-1 gap-3"
              }
            >
              {hasCheckInLocation && (
                <LocationSection
                  title="Check-in location"
                  time={attendance.check_in_time}
                  address={attendance.check_in_address}
                  latitude={attendance.check_in_latitude}
                  longitude={attendance.check_in_longitude}
                />
              )}
              {hasCheckOutLocation && (
                <LocationSection
                  title="Check-out location"
                  time={attendance.check_out_time}
                  address={attendance.check_out_address}
                  latitude={attendance.check_out_latitude}
                  longitude={attendance.check_out_longitude}
                  accuracy={attendance.check_out_gps_accuracy}
                />
              )}
            </div>
          )}

          {hasWorkReport && (
            <InfoCard>
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Work report</h4>
                {attendance.site_name && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Project / Site: </span>
                    {attendance.site_name}
                  </p>
                )}
                {attendance.work_summary && (
                  <p className="whitespace-pre-wrap text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Summary: </span>
                    {attendance.work_summary}
                  </p>
                )}
                {attendance.remarks && (
                  <p className="whitespace-pre-wrap text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Remarks: </span>
                    {attendance.remarks}
                  </p>
                )}
              </section>
            </InfoCard>
          )}

          {photos.sitePhotos.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Site photos</h4>
              <div className="flex flex-wrap gap-2.5">
                {photos.sitePhotos.map((path) => (
                  <AttendancePhotoThumbnail
                    key={path}
                    path={path}
                    alt="Site photo"
                    sizeClassName="h-20 w-20"
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
