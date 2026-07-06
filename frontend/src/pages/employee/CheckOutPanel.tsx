import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Building2, ImagePlus, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Input";
import type { AttendanceRecord, WorkStatus } from "@/types";
import * as attendanceApi from "@/api/attendance";
import { extractErrorMessage } from "@/api/client";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { getCurrentPosition } from "@/hooks/useGeolocation";

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
}: {
  attendance: AttendanceRecord;
  onCheckedOut: () => void;
}) {
  const { publicSettings } = usePublicSettings();
  const gpsRequired = publicSettings?.mobile.gpsRequiredCheckOut ?? false;
  const gpsThreshold = publicSettings?.mobile.gpsAccuracyThresholdMeters ?? 100;

  const [workSummary, setWorkSummary] = useState(attendance.work_summary ?? "");
  const [workStatus, setWorkStatus]   = useState<WorkStatus>((attendance.work_status as WorkStatus) ?? "completed");
  const [remarks, setRemarks]         = useState("");
  const [photos, setPhotos]           = useState<File[]>([]);
  const [previews, setPreviews]       = useState<string[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Explicit validation with clear messages.
    if (workSummary.trim().length < 5) {
      setError("Please describe the work completed today (at least 5 characters).");
      return;
    }
    if (!workStatus) {
      setError("Please select a work status.");
      return;
    }

    setSubmitting(true);
    try {
      let coords: { latitude?: number; longitude?: number; accuracy?: number } = {};
      try {
        const position = await getCurrentPosition();
        if (position.accuracy > gpsThreshold) {
          setError(`GPS accuracy (${Math.round(position.accuracy)}m) is too low. Required: within ${gpsThreshold}m.`);
          setSubmitting(false);
          return;
        }
        coords = { latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy };
      } catch {
        if (gpsRequired) {
          setError("GPS location is required to check out. Please allow location access.");
          setSubmitting(false);
          return;
        }
      }

      await attendanceApi.checkOut({
        workSummary,
        workStatus,
        remarks: remarks || undefined,
        sitePhotos: photos,
        ...coords,
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
      <CardHeader title="Check Out" subtitle="Complete your daily work report before checking out" />
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          {/* Site is selected at check-in and shown here read-only */}
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

          <Textarea
            label="Work Summary"
            required
            rows={4}
            placeholder="Describe the work you completed today"
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
