import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Building2, ImagePlus, LogOut, MapPin, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Input";
import type { AttendanceRecord, WorkStatus } from "@/types";
import * as attendanceApi from "@/api/attendance";
import { extractErrorMessage } from "@/api/client";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { getCurrentPosition } from "@/hooks/useGeolocation";
import type { Coordinates } from "@/hooks/useGeolocation";

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
  const gpsThreshold = publicSettings?.mobile.gpsAccuracyThresholdMeters ?? 100;

  const [workSummary, setWorkSummary] = useState(attendance.work_summary ?? "");
  const [workStatus, setWorkStatus] = useState<WorkStatus>((attendance.work_status as WorkStatus) ?? "completed");
  const [remarks, setRemarks] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLocating(true);
    getCurrentPosition()
      .then((coords) => {
        if (!cancelled) {
          setLocation(coords);
          setLocationError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLocationError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLocating(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function retryLocation() {
    setLocationError(null);
    setLocation(null);
    setLocating(true);
    try {
      setLocation(await getCurrentPosition());
    } catch (err) {
      setLocationError((err as Error).message);
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!workStatus) {
      setError("Please select a work status.");
      return;
    }

    setSubmitting(true);
    try {
      let position: Coordinates;
      try {
        position = await getCurrentPosition();
        setLocation(position);
        setLocationError(null);
      } catch (err) {
        const message =
          (err as Error).message ||
          "Unable to capture your location. Please enable location services and try again.";
        setLocationError(message);
        setError(message);
        setSubmitting(false);
        return;
      }

      if (position.accuracy > gpsThreshold) {
        const accuracyError = `GPS accuracy (${Math.round(position.accuracy)}m) is too low. Required: within ${gpsThreshold}m.`;
        setError(accuracyError);
        setSubmitting(false);
        return;
      }

      await attendanceApi.checkOut({
        workSummary: workSummary.trim() || undefined,
        workStatus,
        remarks: remarks || undefined,
        sitePhotos: photos,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      });
      onCheckedOut();
    } catch (err) {
      setError(extractErrorMessage(err, "Check-out failed. Please review the form and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Check Out"
        subtitle="Confirm your location and complete your daily work report"
        action={
          onCancel ? (
            <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onCancel}>
              Back
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
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

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm font-medium text-slate-900">Check-out Location</p>
            <p className="mt-1 text-xs text-slate-500">
              Your current GPS location is required when you confirm check-out.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              {location ? (
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <MapPin className="h-4 w-4" />
                  Location ready ({Math.round(location.accuracy)}m accuracy)
                </span>
              ) : locationError ? (
                <span className="flex flex-wrap items-center gap-2 text-red-600">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {locationError}
                  </span>
                  <button type="button" onClick={retryLocation} className="font-medium underline">
                    Retry
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <MapPin className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`} />
                  {locating ? "Fetching your location..." : "Waiting for location..."}
                </span>
              )}
            </div>
          </div>

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

          <Button type="submit" isLoading={submitting} icon={<LogOut className="h-4 w-4" />} className="mt-2">
            Confirm Check Out
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
