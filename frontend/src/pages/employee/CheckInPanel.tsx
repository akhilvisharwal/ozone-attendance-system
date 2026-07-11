import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, SwitchCamera } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { getCurrentPosition, isGpsAccuracyAcceptable } from "@/hooks/useGeolocation";
import type { Coordinates } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody } from "@/components/ui/Card";
import { Select, FieldWrapper } from "@/components/ui/Input";
import * as attendanceApi from "@/api/attendance";
import type { CheckInContext } from "@/api/attendance";
import * as sitesApi from "@/api/sites";
import { extractErrorMessage } from "@/api/client";
import { CheckInConfirmModal } from "@/components/CheckInConfirmModal";
import { AttendanceOverrideNoticeBanner } from "@/components/AttendanceOverrideNoticeBanner";
import {
  GPS_REQUIRED_MESSAGE,
  GPS_WEAK_MESSAGE,
  LocationCaptureStatus,
} from "@/components/LocationCaptureStatus";
import { usePublicSettings } from "@/contexts/SettingsContext";
import { formatDate, formatNowTime } from "@/utils/format";
import { GPS_TIMEOUT_MS, withTimeout } from "@/utils/async";
import type { Site, TimingRules, AttendanceOverrideNotice } from "@/types";
import { useAuth } from "@/auth/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  desktopCheckInBlocked,
  offlineCheckInBlocked,
  OFFLINE_BLOCKED_MESSAGE,
} from "@/utils/attendanceCapture";
import { blobToBase64, getPendingAttendance, queuePendingAttendance } from "@/utils/offlineAttendanceQueue";

const INIT_DATA_TIMEOUT_MS = 15_000;
const CAMERA_CAPTURE_TIMEOUT_MS = 10_000;

function hhmm(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

export function CheckInPanel({ onCheckedIn }: { onCheckedIn: () => void }) {
  const { employee } = useAuth();
  const { publicSettings, refresh: refreshPublicSettings } = usePublicSettings();
  const mobile = publicSettings?.mobile;
  const selfieRequired = mobile?.selfieRequiredCheckIn ?? true;
  const gpsRequired = mobile?.gpsRequiredCheckIn ?? true;
  const allowCameraSwitch = mobile?.allowCameraSwitch ?? true;
  const gpsThreshold = mobile?.gpsAccuracyThresholdMeters ?? 100;
  const online = useOnlineStatus();
  const desktopBlocked = desktopCheckInBlocked(mobile);
  const profilePhotoRequired = publicSettings?.employee?.profilePhotoRequired ?? false;
  const missingProfilePhoto = profilePhotoRequired && !employee?.profile_photo_path;

  const camera = useCamera();
  const selfieBlobRef = useRef<Blob | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [siteId, setSiteId] = useState("");

  const [rules, setRules] = useState<TimingRules | null>(null);
  const [activeOverride, setActiveOverride] = useState<AttendanceOverrideNotice | null>(null);
  const [checkInContext, setCheckInContext] = useState<CheckInContext | null>(null);
  const [showOffDayConfirm, setShowOffDayConfirm] = useState(false);
  const [nowStr, setNowStr] = useState(formatNowTime());
  const [todayLabel, setTodayLabel] = useState(formatDate(new Date().toISOString()));

  const loadEmployeeContext = useCallback(async () => {
    try {
      const [timing, context] = await Promise.all([
        withTimeout(
          attendanceApi.getTimingRules(),
          INIT_DATA_TIMEOUT_MS,
          "Could not load timing rules."
        ),
        withTimeout(
          attendanceApi.getCheckInContext(),
          INIT_DATA_TIMEOUT_MS,
          "Could not load check-in context."
        ),
      ]);
      setRules(timing.rules);
      setActiveOverride(timing.activeOverride ?? context.activeOverride);
      setCheckInContext(context);
    } catch (err) {
      console.error("[CheckInPanel] failed to load employee context:", err);
    }
  }, []);

  useEffect(() => {
    void loadEmployeeContext();
  }, [loadEmployeeContext]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadEmployeeContext();
        void refreshPublicSettings();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadEmployeeContext, refreshPublicSettings]);

  const overrideNotice = useMemo(
    () => activeOverride ?? publicSettings?.attendanceOverride ?? null,
    [activeOverride, publicSettings?.attendanceOverride]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const loadedSites = await withTimeout(
          sitesApi.listSites(),
          INIT_DATA_TIMEOUT_MS,
          "Could not load the site list."
        );
        if (!cancelled) setSites(loadedSites);
      } catch (err) {
        console.error("[CheckInPanel] failed to load sites:", err);
        if (!cancelled) setSubmitError("Could not load sites. Please refresh the page.");
      } finally {
        if (!cancelled) setLoadingSites(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sites.length === 1) {
      setSiteId(sites[0].id);
    }
  }, [sites]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setNowStr(formatNowTime());
      setTodayLabel(formatDate(now.toISOString()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(null);
    setLocation(null);
    try {
      const coords = await getCurrentPosition({
        timeoutMs: GPS_TIMEOUT_MS,
        targetAccuracyMeters: gpsThreshold,
      });
      setLocation(coords);
      if (!isGpsAccuracyAcceptable(coords.accuracy, gpsThreshold)) {
        setLocationError(null);
      }
    } catch (err) {
      console.error("[CheckInPanel] location fetch failed:", err);
      setLocationError(
        err instanceof Error ? err.message : "Unable to detect your location. Please enable GPS."
      );
    } finally {
      setLocationLoading(false);
    }
  }, [gpsThreshold]);

  useEffect(() => {
    if (selfieRequired) {
      void camera.start("user").catch((err) => {
        console.error("[CheckInPanel] camera start failed:", err);
      });
    }
    if (gpsRequired) {
      void fetchLocation();
    }
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfieRequired, gpsRequired, fetchLocation]);

  const isHalfDayCheckIn = useMemo(() => {
    if (!rules) return false;
    const t = hhmm(new Date());
    return t >= rules.halfDayCutoff;
  }, [rules, nowStr]);

  const validateCheckInForm = useCallback(
    (blob: Blob | null): string | null => {
      if (missingProfilePhoto) {
        return "A profile photo is required before check-in. Upload your photo from the menu, then try again.";
      }
      if (selfieRequired && !blob) {
        return "Could not capture selfie. Please try again.";
      }
      if (gpsRequired && locationLoading) {
        return "Detecting location… please wait a moment.";
      }
      if (gpsRequired && !location) {
        return locationError ?? GPS_REQUIRED_MESSAGE;
      }
      if (location && !isGpsAccuracyAcceptable(location.accuracy, gpsThreshold)) {
        return GPS_WEAK_MESSAGE;
      }
      if (!siteId) {
        return sites.length === 0 ? "No site available. Contact your administrator." : "Please select a site.";
      }
      return null;
    },
    [
      gpsRequired,
      gpsThreshold,
      location,
      locationError,
      locationLoading,
      missingProfilePhoto,
      selfieRequired,
      siteId,
      sites.length,
    ]
  );

  const submitCheckIn = useCallback(
    async (selfieOverride?: Blob | null) => {
      if (submitting) return;

      const blob = selfieOverride ?? capturedBlob;
      const validationError = validateCheckInForm(blob);
      if (validationError) {
        setSubmitError(validationError);
        setShowOffDayConfirm(false);
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        if (desktopBlocked) {
          setSubmitError("Attendance capture from desktop or web browsers is disabled. Please use a mobile device.");
          return;
        }
        if (offlineCheckInBlocked(mobile, online)) {
          setSubmitError(OFFLINE_BLOCKED_MESSAGE);
          return;
        }

        const payload = {
          selfie: selfieRequired ? blob : null,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          accuracy: location?.accuracy,
          siteId,
          deviceInfo: navigator.userAgent,
        };

        if (!online && mobile?.allowOfflineMode) {
          queuePendingAttendance({
            type: "check-in",
            createdAt: new Date().toISOString(),
            siteId,
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracy: payload.accuracy,
            deviceInfo: payload.deviceInfo,
            selfieBase64: blob ? await blobToBase64(blob) : null,
          });
          setShowOffDayConfirm(false);
          onCheckedIn();
          return;
        }

        await attendanceApi.checkIn(payload);
        setShowOffDayConfirm(false);
        onCheckedIn();
      } catch (err) {
        console.error("[CheckInPanel] check-in API failed:", err);
        setSubmitError(extractErrorMessage(err, "Check-in failed. Please try again."));
        setShowOffDayConfirm(false);
      } finally {
        setSubmitting(false);
      }
    },
    [capturedBlob, location, mobile, onCheckedIn, online, selfieRequired, siteId, submitting, validateCheckInForm, desktopBlocked]
  );

  const handleCheckIn = useCallback(async () => {
    if (submitting) return;

    setSubmitError(null);

    let blob = capturedBlob;
    if (selfieRequired && !blob) {
      if (!camera.isActive) {
        setSubmitError("Camera is not ready. Please allow camera access.");
        return;
      }
      try {
        blob = await withTimeout(
          camera.capture(),
          CAMERA_CAPTURE_TIMEOUT_MS,
          "Selfie capture timed out. Please try again."
        );
        selfieBlobRef.current = blob;
        setCapturedBlob(blob);
        setCapturedPreview(URL.createObjectURL(blob));
        camera.stop();
      } catch (err) {
        console.error("[CheckInPanel] selfie capture failed:", err);
        setSubmitError(
          err instanceof Error ? err.message : "Could not capture selfie. Please try again."
        );
        return;
      }
    }

    const validationError = validateCheckInForm(blob);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    if (checkInContext?.requiresConfirmation) {
      setShowOffDayConfirm(true);
      return;
    }

    await submitCheckIn(blob);
  }, [
    camera,
    capturedBlob,
    checkInContext?.requiresConfirmation,
    selfieRequired,
    submitCheckIn,
    submitting,
    validateCheckInForm,
  ]);

  const handleOffDayCancel = useCallback(() => {
    if (submitting) return;
    setShowOffDayConfirm(false);
  }, [submitting]);

  const locationAccurate = Boolean(
    location && isGpsAccuracyAcceptable(location.accuracy, gpsThreshold)
  );
  const cameraReady = !selfieRequired || Boolean(capturedBlob) || camera.isActive;
  const siteReady = Boolean(siteId) && !loadingSites;

  const readyToCheckIn = Boolean(
    siteReady &&
    !missingProfilePhoto &&
    cameraReady &&
    (!gpsRequired || (locationAccurate && !locationLoading))
  );

  const readinessHint = (() => {
    if (desktopBlocked || missingProfilePhoto || submitting) return null;
    if (loadingSites) return "Loading sites…";
    if (sites.length === 0) return "No site available. Contact your administrator.";
    if (!siteId && sites.length > 1) return "Select a project/site to enable Check In.";
    if (selfieRequired && !capturedBlob && !camera.isActive && !camera.error) {
      return "Waiting for camera…";
    }
    if (gpsRequired && locationLoading) return "Waiting for an accurate GPS fix…";
    if (gpsRequired && location && !locationAccurate) {
      return "GPS is too weak for check-in. Move outdoors and retry location.";
    }
    if (gpsRequired && !location && locationError) return null;
    if (gpsRequired && !location) return "Waiting for location…";
    return null;
  })();

  const singleSite = sites.length === 1 ? sites[0] : null;
  const mirror = camera.facingMode === "user";

  const primaryAlert =
    submitError ??
    (missingProfilePhoto
      ? "A profile photo is required before check-in. Upload your photo from the menu, then try again."
      : null) ??
    (desktopBlocked
      ? "Attendance capture from desktop or web browsers is disabled. Please use a mobile device."
      : null) ??
    camera.error ??
    (isHalfDayCheckIn ? "Check-in after the half-day cutoff will be recorded as a half-day." : null);

  const pendingCount = getPendingAttendance().length;

  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <CardBody className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">{todayLabel}</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
              {nowStr}
            </p>
          </div>

          {primaryAlert && (
            <Alert
              variant={
                submitError || camera.error || desktopBlocked || missingProfilePhoto ? "error" : "info"
              }
            >
              {primaryAlert}
            </Alert>
          )}

          {!online && mobile?.allowOfflineMode && (
            <Alert variant="info">
              You are offline. Attendance will be saved locally and synced when you reconnect.
            </Alert>
          )}

          {pendingCount > 0 && (
            <Alert variant="info">
              {pendingCount} pending attendance record{pendingCount === 1 ? "" : "s"} waiting to sync.
            </Alert>
          )}

          <AttendanceOverrideNoticeBanner override={overrideNotice} compact />

          {selfieRequired && (
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[280px] overflow-hidden rounded-2xl bg-slate-900 shadow-lg ring-1 ring-slate-900/10">
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
              loading={locationLoading}
              captured={Boolean(location)}
              accuracyOk={!location || locationAccurate}
              accuracyMeters={location?.accuracy ?? null}
              accuracyThresholdMeters={gpsThreshold}
              error={locationError}
              onRetry={() => void fetchLocation()}
              successLabel="✓ Location captured"
            />
          )}

          {sites.length > 1 && (
            <FieldWrapper label="Project / Site" required>
              <Select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                disabled={loadingSites || submitting}
              >
                <option value="">{loadingSites ? "Loading…" : "Select site"}</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                    {site.type === "office" ? " (Office)" : ""}
                  </option>
                ))}
              </Select>
            </FieldWrapper>
          )}

          {singleSite && (
            <p className="text-center text-sm text-slate-500">
              Site: <span className="font-medium text-slate-700">{singleSite.name}</span>
            </p>
          )}

          {readinessHint && (
            <p className="text-center text-sm text-slate-500">{readinessHint}</p>
          )}

          <Button
            size="lg"
            onClick={() => void handleCheckIn()}
            isLoading={submitting}
            disabled={
              (!readyToCheckIn && !(mobile?.allowOfflineMode && !online)) ||
              submitting ||
              desktopBlocked ||
              missingProfilePhoto
            }
            icon={<CheckCircle2 className="h-5 w-5" />}
            className="min-h-[3.25rem] w-full text-base font-semibold"
          >
            Check In
          </Button>
        </CardBody>
      </Card>

      <CheckInConfirmModal
        open={showOffDayConfirm}
        context={checkInContext}
        isLoading={submitting}
        onCancel={handleOffDayCancel}
        onConfirm={() => submitCheckIn(selfieBlobRef.current ?? capturedBlob)}
      />
    </>
  );
}
