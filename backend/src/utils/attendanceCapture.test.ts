import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isDesktopClient,
  isMobileUserAgent,
  normalizeMobileSettings,
  validateAttendanceCapture,
} from "./attendanceCapture";
import type { MobileSettings } from "../modules/settings/settings.types";

const baseMobile: MobileSettings = {
  gpsRequiredCheckIn: true,
  gpsRequiredCheckOut: true,
  selfieRequiredCheckIn: true,
  selfieRequiredCheckOut: false,
  allowCameraSwitch: true,
  gpsAccuracyThresholdMeters: 100,
  allowOfflineMode: false,
  allowDesktopCheckIn: true,
};

describe("attendance capture helpers", () => {
  it("detects mobile and desktop user agents", () => {
    assert.equal(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
    assert.equal(isDesktopClient("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"), true);
  });

  it("normalizes mobile settings defaults for new fields", () => {
    const normalized = normalizeMobileSettings({
      ...baseMobile,
      allowOfflineMode: undefined as unknown as boolean,
      allowDesktopCheckIn: undefined as unknown as boolean,
      gpsAccuracyThresholdMeters: 99.4,
    });
    assert.equal(normalized.allowOfflineMode, false);
    assert.equal(normalized.allowDesktopCheckIn, true);
    assert.equal(normalized.gpsAccuracyThresholdMeters, 99);
  });

  it("blocks desktop capture when disabled", () => {
    const message = validateAttendanceCapture({
      mobile: { ...baseMobile, allowDesktopCheckIn: false },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      action: "check-in",
      hasSelfie: true,
      hasGps: true,
      accuracy: 20,
    });
    assert.match(message ?? "", /desktop or web browsers is disabled/i);
  });

  it("enforces selfie and GPS requirements per action", () => {
    assert.match(
      validateAttendanceCapture({
        mobile: baseMobile,
        userAgent: "Mozilla/5.0 (iPhone)",
        action: "check-in",
        hasSelfie: false,
        hasGps: true,
      }) ?? "",
      /selfie/i
    );

    assert.equal(
      validateAttendanceCapture({
        mobile: { ...baseMobile, gpsRequiredCheckOut: false },
        userAgent: "Mozilla/5.0 (iPhone)",
        action: "check-out",
        hasSelfie: true,
        hasGps: false,
      }),
      null
    );

    assert.match(
      validateAttendanceCapture({
        mobile: { ...baseMobile, selfieRequiredCheckOut: true },
        userAgent: "Mozilla/5.0 (iPhone)",
        action: "check-out",
        hasSelfie: false,
        hasGps: true,
      }) ?? "",
      /selfie/i
    );
  });

  it("rejects weak GPS accuracy above threshold", () => {
    const message = validateAttendanceCapture({
      mobile: baseMobile,
      userAgent: "Mozilla/5.0 (iPhone)",
      action: "check-in",
      hasSelfie: true,
      hasGps: true,
      accuracy: 250,
    });
    assert.match(message ?? "", /GPS accuracy/i);
  });
});
