import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Building2, ImagePlus, LogOut, SwitchCamera, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Input";
import type { AttendanceRecord, WorkStatus } from "@/types";
import * as attendanceApi from "@/api/attendance";
import { extractErrorMessage } from "@/api/client";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { useCamera } from "@/hooks/useCamera";
import { getCurrentPosition } from "@/hooks/useGeolocation";
import type { Coordinates } from "@/hooks/useGeolocation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  desktopCheckInBlocked,
  offlineCheckInBlocked,
  OFFLINE_BLOCKED_MESSAGE,
} from "@/utils/attendanceCapture";
import { blobToBase64, queuePendingAttendance } from "@/utils/offlineAttendanceQueue";
import {
  GPS_REQUIRED_MESSAGE,
  GPS_WEAK_MESSAGE,
  LocationCaptureStatus,
} from "@/components/LocationCaptureStatus";
import { withTimeout } from "@/utils/async";

const CAMERA_CAPTURE_TIMEOUT_MS = 10_000;

const WORK_STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending", label: "Pending" },
  { value: "on_hold", label: "On Hold" },
  { value: "cancelled", label: "Cancelled" },
];

export function CheckOutPanel({
  attendance,
  onCheckedOut,
  onCancel,
}: {
  attendance: AttendanceRecord;
  onCheckedOut: () => void;
  onCancel?: () => void;
}) {
  const { publicSettings } = usePublicSettings();
  const mobile = publicSettings?.mobile;
  const gpsRequired = mobile?.gpsRequiredCheckOut ?? true;
  const selfieRequired = mobile?.selfieRequiredCheckOut ?? false;
  const allowCameraSwitch = mobile?.allowCameraSwitch ?? true;
  const gpsThreshold = mobile?.gpsAccuracyThresholdMeters ?? 100;
  const online = useOnlineStatus();
  const desktopBlocked = desktopCheckInBlocked(mobile);

  const camera = useCamera();
  const selfieBlobRef = useRef<Blob | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const [workSummary, setWorkSummary] = useState(attendance.work_summary ?? "");
  const [workStatus, setWorkStatus] = useState<WorkStatus>((attendance.work_status as WorkStatus) ?? "completed");
  const [remarks, setRemarks] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocation = useCallback(async () => {
    if (!gpsRequired) return;
    setLocating(true);
    setLocationError(null);
    setLocation(null);
    try {
      const coords = await getCurrentPosition();
      setLocation(coords);
    } catch (err) {
      setLocationError((err as Error).message || GPS_REQUIRED_MESSAGE);
    } finally {
      setLocating(false);
    }
  }, [gpsRequired]);

  useEffect(() => {
    if (selfieRequired) {
      void camera.start("user").catch((err) => {
        console.error("[CheckOutPanel] camera start failed:", err);
      });
    }
    if (gpsRequired) {
      void fetchLocation();
    }
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfieRequired, gpsRequired, fetchLocation]);

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - photos.length);
    setPhotos((prev) => [...prev, ...files]);
    setPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    e.target.value = "";
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(previews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  const readyToSubmit = useMemo(() => {
    if (desktopBlocked) return false;
    if (gpsRequired && (!location || locating || location.accuracy > gpsThreshold)) return false;
    if (selfieRequired && !capturedBlob && !camera.isActive) return false;
    return true;
  }, [camera.isActive, capturedBlob, desktopBlocked, gpsRequired, gpsThreshold, locating, location, selfieRequired]);

  async function captureSelfieIfNeeded(): Promise<Blob | null> {
    if (!selfieRequired) return null;
    if (capturedBlob) return capturedBlob;
    if (!camera.isActive) {
      throw new Error("Camera is not ready. Please allow camera access.");
    }
    const blob = await withTimeout(
      camera.capture(),
      CAMERA_CAPTURE_TIMEOUT_MS,
      "Selfie capture timed out. Please try again."
    );
    selfieBlobRef.current = blob;
    setCapturedBlob(blob);
    setCapturedPreview(URL.createObjectURL(blob));
    camera.stop();
    return blob;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!workStatus) {
      setError("Please select a work status.");
      return;
    }
    if (desktopBlocked) {
      setError("Attendance capture from desktop or web browsers is disabled. Please use a mobile device.");
      return;
    }
    if (offlineCheckInBlocked(mobile, online)) {
      setError(OFFLINE_BLOCKED_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      const selfie = await captureSelfieIfNeeded();
      const position = gpsRequired ? location ?? (await getCurrentPosition()) : null;

      if (gpsRequired) {
        if (!position) {
          setError(locationError ?? GPS_REQUIRED_MESSAGE);
          return;
        }
        if (position.accuracy > gpsThreshold) {
          setError(GPS_WEAK_MESSAGE);
          return;
        }
      }

      const payload = {
        workSummary: workSummary.trim() || undefined,
        workStatus,
        remarks: remarks || undefined,
        sitePhotos: photos,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        accuracy: position?.accuracy,
        selfie,
        deviceInfo: navigator.userAgent,
      };

      if (!online && mobile?.allowOfflineMode) {
        queuePendingAttendance({
          type: "check-out",
          createdAt: new Date().toISOString(),
          workSummary: payload.workSummary,
          workStatus: payload.workStatus,
          remarks: payload.remarks,
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy: payload.accuracy,
          selfieBase64: selfie ? await blobToBase64(selfie) : null,
        });
        onCheckedOut();
        return;
      }

      await attendanceApi.checkOut(payload);
      onCheckedOut();
    } catch (err) {
      setError(extractErrorMessage(err, "Check-out failed. Please review the form and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const mirror = camera.facingMode === "user";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title="Check Out"
        subtitle="Complete your daily work report and confirm check-out"
        action={
          onCancel ? (
            <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onCancel}>
              Back
            </Button>
          ) : undefined
        }
      />
      <CardBody className="min-w-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          {desktopBlocked && (
            <Alert variant="error">
              Attendance capture from desktop or web browsers is disabled. Please use a mobile device.
            </Alert>
          )}
          {!online && mobile?.allowOfflineMode && (
            <Alert variant="info">
              You are offline. Check-out will be saved locally and synced when you reconnect.
            </Alert>
          )}

          <div className="flex min-w-0 items-center gap-3 rounded-lg bg-slate-50 p-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Project / Site</p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {attendance.site_name ?? "Site selected at check-in"}
              </p>
            </div>
          </div>

          {selfieRequired && (
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[240px] overflow-hidden rounded-2xl bg-slate-900 shadow-lg ring-1 ring-slate-900/10">
              {!capturedPreview ? (
                <video
                  ref={camera.videoRef}
                  muted
                  playsInline
                  className={`h-full w-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
                />
              ) : (
                <img src={capturedPreview} alt="Captured selfie" className="h-full w-full object-cover" />
              )}
              {!capturedPreview && allowCameraSwitch && (
                <button
                  type="button"
                  onClick={() => void camera.switchCamera()}
                  disabled={!camera.isActive || submitting}
                  className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 disabled:opacity-40"
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {gpsRequired && (
            <LocationCaptureStatus
              loading={locating}
              captured={Boolean(location)}
              error={locationError}
              onRetry={() => void fetchLocation()}
              successLabel="✓ Location captured"
            />
          )}

          <Textarea
            label="Work Summary"
            hint="Optional — describe the work you completed today"
            rows={4}
            placeholder="Describe the work you completed today (optional)"
            value={workSummary}
            onChange={(e) => setWorkSummary(e.target.value)}
          />

          <Select
            label="Work Status"
            required
            value={workStatus}
            onChange={(e) => setWorkStatus(e.target.value as WorkStatus)}
          >
            {WORK_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>

          <Textarea
            label="Remarks"
            hint="Optional"
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Site Photos (optional)</label>
            <div className="flex flex-wrap gap-3">
              {previews.map((src, idx) => (
                <div key={src} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                  <img src={src} alt={`Site photo ${idx + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500">
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-[10px]">Add photo</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
                </label>
              )}
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            isLoading={submitting}
            disabled={(!readyToSubmit && !(mobile?.allowOfflineMode && !online)) || submitting}
            icon={<LogOut className="h-4 w-4" />}
            className="mt-1 min-h-[3.25rem] w-full text-base font-semibold"
          >
            Confirm Check Out
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
