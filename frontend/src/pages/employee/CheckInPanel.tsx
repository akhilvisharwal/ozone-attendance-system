import { useEffect, useState, useCallback } from "react";
import {
  Camera, CheckCircle2, MapPin, RefreshCcw, Clock, AlertTriangle, Info, SwitchCamera,
} from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { getCurrentPosition } from "@/hooks/useGeolocation";
import type { Coordinates } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea, FieldWrapper } from "@/components/ui/Input";
import * as attendanceApi from "@/api/attendance";
import * as sitesApi from "@/api/sites";
import { extractErrorMessage } from "@/api/client";
import { usePublicSettings } from "@/contexts/SettingsContext";
import type { CheckInStatus, Site, TimingRules, WorkStatus } from "@/types";

const WORK_STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: "in_progress", label: "In Progress" },
  { value: "pending", label: "Pending" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function hhmm(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function classifyNow(rules: TimingRules): { status: CheckInStatus; isHalfDay: boolean } {
  const t = hhmm(new Date());
  if (t < rules.checkinOpenTime)  return { status: "early",    isHalfDay: false };
  if (t <= rules.checkinOntimeEnd) return { status: "on_time",  isHalfDay: false };
  if (t < rules.halfDayCutoff)    return { status: "late",     isHalfDay: false };
  return                                 { status: "half_day", isHalfDay: true  };
}

const STATUS_UI: Record<CheckInStatus, { label: string; className: string; Icon: React.ElementType }> = {
  early:    { label: "Early Arrival",  className: "bg-blue-50 border-blue-200 text-blue-800",   Icon: Info          },
  on_time:  { label: "On Time",        className: "bg-green-50 border-green-200 text-green-800", Icon: CheckCircle2  },
  late:     { label: "Late Arrival",   className: "bg-amber-50 border-amber-200 text-amber-800", Icon: AlertTriangle },
  half_day: { label: "Half Day",       className: "bg-red-50 border-red-200 text-red-800",       Icon: AlertTriangle },
};

export function CheckInPanel({ onCheckedIn }: { onCheckedIn: () => void }) {
  const { publicSettings } = usePublicSettings();
  const mobile = publicSettings?.mobile;
  const selfieRequired = mobile?.selfieRequiredCheckIn ?? true;
  const gpsRequired = mobile?.gpsRequiredCheckIn ?? true;
  const allowCameraSwitch = mobile?.allowCameraSwitch ?? true;
  const gpsThreshold = mobile?.gpsAccuracyThresholdMeters ?? 100;

  const camera = useCamera();
  const [location, setLocation]     = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob]   = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Site + optional work details
  const [sites, setSites]           = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [siteId, setSiteId]         = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [workStatus, setWorkStatus] = useState<WorkStatus | "">("");

  const [rules, setRules] = useState<TimingRules | null>(null);
  const [currentStatus, setCurrentStatus] = useState<{ status: CheckInStatus; isHalfDay: boolean } | null>(null);
  const [nowStr, setNowStr] = useState(hhmm(new Date()));

  useEffect(() => {
    attendanceApi.getTimingRules()
      .then(r => setRules(r))
      .catch(() => { /* non-critical; check-in still works */ });
  }, []);

  useEffect(() => {
    sitesApi.listSites()
      .then(setSites)
      .catch(() => setSubmitError("Could not load the site list. Please refresh the page."))
      .finally(() => setLoadingSites(false));
  }, []);

  useEffect(() => {
    const tick = () => {
      setNowStr(hhmm(new Date()));
      if (rules) setCurrentStatus(classifyNow(rules));
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [rules]);

  useEffect(() => {
    if (selfieRequired) camera.start("user");
    if (gpsRequired) {
      getCurrentPosition()
        .then(setLocation)
        .catch((err: Error) => setLocationError(err.message));
    }
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfieRequired, gpsRequired]);

  const handleCapture = useCallback(async () => {
    try {
      const blob = await camera.capture();
      setCapturedBlob(blob);
      setCapturedPreview(URL.createObjectURL(blob));
      camera.stop();
    } catch {
      setSubmitError("Could not capture selfie. Please try again.");
    }
  }, [camera]);

  function handleRetake() {
    setCapturedBlob(null);
    if (capturedPreview) URL.revokeObjectURL(capturedPreview);
    setCapturedPreview(null);
    camera.start(camera.facingMode);
  }

  async function retryLocation() {
    setLocationError(null);
    setLocation(null);
    try {
      setLocation(await getCurrentPosition());
    } catch (err) {
      setLocationError((err as Error).message);
    }
  }

  async function handleConfirm() {
    setSubmitError(null);
    if (selfieRequired && !capturedBlob) { setSubmitError("Please capture a live selfie before checking in."); return; }
    if (gpsRequired && !location) { setSubmitError("A live GPS location is required. Please allow location access."); return; }
    if (location && location.accuracy > gpsThreshold) {
      setSubmitError(`GPS accuracy (${Math.round(location.accuracy)}m) is too low. Required: within ${gpsThreshold}m.`);
      return;
    }
    if (!siteId) { setSubmitError("Please select the project/site you are working at."); return; }

    setSubmitting(true);
    try {
      await attendanceApi.checkIn({
        selfie: selfieRequired ? capturedBlob : null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracy: location?.accuracy,
        siteId,
        workSummary: workSummary || undefined,
        workStatus:  workStatus || undefined,
        deviceInfo:  navigator.userAgent,
      });
      onCheckedIn();
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Check-in failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const readyToCheckIn = Boolean(
    siteId &&
    (!selfieRequired || capturedBlob) &&
    (!gpsRequired || (location && location.accuracy <= gpsThreshold))
  );
  const mirror = camera.facingMode === "user";

  return (
    <Card>
      <CardHeader title="Check In" subtitle="Capture a live selfie, confirm your location, and select your site" />
      <CardBody className="flex flex-col gap-4">
        {submitError && <Alert variant="error">{submitError}</Alert>}
        {camera.error && <Alert variant="error">{camera.error}</Alert>}

        {rules && currentStatus && (() => {
          const ui = STATUS_UI[currentStatus.status];
          const Icon = ui.Icon;
          return (
            <div className={`flex items-start gap-3 rounded-lg border p-3 ${ui.className}`}>
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">{ui.label} — {nowStr}</p>
                {currentStatus.status === "early" && (
                  <p className="text-xs mt-0.5">Check-in window opens at <strong>{rules.checkinOpenTime}</strong>.</p>
                )}
                {currentStatus.status === "on_time" && (
                  <p className="text-xs mt-0.5">You are within the on-time window ({rules.checkinOpenTime} – {rules.checkinOntimeEnd}).</p>
                )}
                {currentStatus.status === "late" && (
                  <p className="text-xs mt-0.5">You are past the on-time window. Checking in before <strong>{rules.halfDayCutoff}</strong> avoids a half-day.</p>
                )}
                {currentStatus.status === "half_day" && (
                  <p className="text-xs mt-0.5">Check-in after {rules.halfDayCutoff} is automatically recorded as a <strong>half-day</strong>.</p>
                )}
              </div>
            </div>
          );
        })()}

        {rules && (
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 justify-center">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              On-time: {rules.checkinOpenTime}–{rules.checkinOntimeEnd}
            </span>
            <span>·</span>
            <span>Half-day after: {rules.halfDayCutoff}</span>
            <span>·</span>
            <span>Standard checkout: {rules.checkoutStandardTime}</span>
          </div>
        )}

        {selfieRequired && (
        <div className="relative mx-auto flex aspect-square w-full max-w-xs items-center justify-center overflow-hidden rounded-xl bg-slate-900">
          {!capturedPreview && (
            <video
              ref={camera.videoRef}
              muted
              playsInline
              className={`h-full w-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
            />
          )}
          {capturedPreview && <img src={capturedPreview} alt="Captured selfie" className="h-full w-full object-cover" />}

          {/* Switch front/rear camera (only while previewing live) */}
          {!capturedPreview && (
            <button
              type="button"
              onClick={() => camera.switchCamera()}
              disabled={!camera.isActive}
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/60 text-white backdrop-blur transition hover:bg-slate-900/80 disabled:opacity-40"
              title="Switch camera"
            >
              <SwitchCamera className="h-4 w-4" />
              <span className="sr-only">Switch camera</span>
            </button>
          )}
        </div>
        )}

        {/* Location status */}
        {(gpsRequired || location) && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {location ? (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <MapPin className="h-4 w-4" /> Location captured ({location.accuracy.toFixed(0)}m accuracy)
            </span>
          ) : locationError ? (
            <span className="flex flex-wrap items-center justify-center gap-2 text-red-600">
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {locationError}</span>
              <button type="button" onClick={retryLocation} className="font-medium underline">Retry</button>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-400">
              <MapPin className="h-4 w-4 animate-pulse" /> Fetching your location...
            </span>
          )}
        </div>
        )}

        {selfieRequired && (
        <div className="flex flex-wrap justify-center gap-3">
          {!capturedPreview ? (
            <>
              <Button onClick={handleCapture} disabled={!camera.isActive} icon={<Camera className="h-4 w-4" />}>
                Capture Selfie
              </Button>
              {allowCameraSwitch && (
              <Button variant="outline" onClick={() => camera.switchCamera()} disabled={!camera.isActive} icon={<SwitchCamera className="h-4 w-4" />}>
                {camera.facingMode === "user" ? "Rear Camera" : "Front Camera"}
              </Button>
              )}
            </>
          ) : (
            <Button variant="outline" onClick={handleRetake} icon={<RefreshCcw className="h-4 w-4" />}>
              Retake Selfie
            </Button>
          )}
        </div>
        )}

        {/* Site + optional work details */}
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
          <FieldWrapper label="Project / Site" required>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={loadingSites}>
              <option value="">{loadingSites ? "Loading sites..." : "Select a project or site"}</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}{site.type === "office" ? " (Office)" : ""}
                </option>
              ))}
            </Select>
          </FieldWrapper>

          <FieldWrapper label="Work Summary" hint="Optional — you can complete this at check-out">
            <Textarea
              rows={2}
              placeholder="What are you planning to work on today?"
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
            />
          </FieldWrapper>

          <FieldWrapper label="Work Status" hint="Optional">
            <Select value={workStatus} onChange={(e) => setWorkStatus(e.target.value as WorkStatus | "")}>
              <option value="">Not set</option>
              {WORK_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FieldWrapper>
        </div>

        <Button
          onClick={handleConfirm}
          isLoading={submitting}
          disabled={!readyToCheckIn}
          icon={<CheckCircle2 className="h-4 w-4" />}
          className="mt-1"
        >
          Confirm Check In
        </Button>

        {!readyToCheckIn && !submitting && (
          <p className="text-center text-xs text-slate-400">
            {[
              selfieRequired ? "selfie" : null,
              gpsRequired ? "GPS location" : null,
              "selected site",
            ].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")} required to check in.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
