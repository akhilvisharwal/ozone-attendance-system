import type { MobileSettings } from "../modules/settings/settings.types";

export type CaptureAction = "check-in" | "check-out";

const MOBILE_UA_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function isMobileUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  return MOBILE_UA_PATTERN.test(userAgent);
}

export function isDesktopClient(userAgent: string | undefined | null): boolean {
  return !isMobileUserAgent(userAgent);
}

export interface CaptureValidationInput {
  mobile: MobileSettings;
  userAgent: string | undefined | null;
  action: CaptureAction;
  hasSelfie: boolean;
  hasGps: boolean;
  accuracy?: number;
}

/** Returns an error message when capture requirements are not met, otherwise null. */
export function validateAttendanceCapture(input: CaptureValidationInput): string | null {
  const { mobile, userAgent, action, hasSelfie, hasGps, accuracy } = input;

  if (!mobile.allowDesktopCheckIn && isDesktopClient(userAgent)) {
    return "Attendance capture from desktop or web browsers is disabled. Please use a mobile device.";
  }

  const selfieRequired =
    action === "check-in" ? mobile.selfieRequiredCheckIn : mobile.selfieRequiredCheckOut;
  const gpsRequired = action === "check-in" ? mobile.gpsRequiredCheckIn : mobile.gpsRequiredCheckOut;

  if (selfieRequired && !hasSelfie) {
    return action === "check-in"
      ? "A live selfie captured from the camera is required to check in"
      : "A live selfie captured from the camera is required to check out";
  }

  if (gpsRequired && !hasGps) {
    return action === "check-in"
      ? "GPS location is required to check in"
      : "GPS location is required to check out. Please enable location services and try again.";
  }

  if (hasGps && accuracy !== undefined && accuracy > mobile.gpsAccuracyThresholdMeters) {
    return `GPS accuracy (${Math.round(accuracy)}m) exceeds the allowed threshold of ${mobile.gpsAccuracyThresholdMeters}m`;
  }

  return null;
}

export function normalizeMobileSettings(settings: MobileSettings): MobileSettings {
  return {
    ...settings,
    gpsAccuracyThresholdMeters: Math.round(settings.gpsAccuracyThresholdMeters),
    allowOfflineMode: settings.allowOfflineMode ?? false,
    allowDesktopCheckIn: settings.allowDesktopCheckIn ?? true,
  };
}
