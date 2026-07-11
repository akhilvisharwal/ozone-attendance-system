export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GeolocationOptions {
  /** Maximum wait time in milliseconds. Defaults to 20 seconds. */
  timeoutMs?: number;
  /**
   * When set, resolve as soon as a reading meets this accuracy (meters).
   * Otherwise (or if never met) resolve with the best reading before timeout.
   */
  targetAccuracyMeters?: number;
}

export function normalizeGpsAccuracy(accuracy: unknown): number {
  if (accuracy == null) return Number.POSITIVE_INFINITY;
  const value = typeof accuracy === "number" ? accuracy : Number(accuracy);
  return Number.isFinite(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

export function isGpsAccuracyAcceptable(
  accuracy: unknown,
  thresholdMeters: number
): boolean {
  return normalizeGpsAccuracy(accuracy) <= thresholdMeters;
}

/**
 * Acquires GPS using watchPosition so coarse network fixes can improve to a
 * usable high-accuracy reading before we decide success/failure.
 */
export function getCurrentPosition(options: GeolocationOptions = {}): Promise<Coordinates> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const targetAccuracy = options.targetAccuracyMeters;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device/browser."));
      return;
    }

    let best: Coordinates | null = null;
    let settled = false;
    let watchId: number | null = null;

    const cleanup = () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      window.clearTimeout(timer);
    };

    const finish = (coords: Coordinates) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(coords);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const timer = window.setTimeout(() => {
      if (best) {
        finish(best);
        return;
      }
      fail("Unable to get your location. Please enable GPS and try again.");
    }, timeoutMs);

    const onPosition = (position: GeolocationPosition) => {
      const coords: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: normalizeGpsAccuracy(position.coords.accuracy),
      };

      if (!best || coords.accuracy < best.accuracy) {
        best = coords;
      }

      if (
        targetAccuracy != null &&
        Number.isFinite(targetAccuracy) &&
        coords.accuracy <= targetAccuracy
      ) {
        finish(coords);
      }
    };

    watchId = navigator.geolocation.watchPosition(
      onPosition,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          fail("Location access was denied. Please allow location permissions to continue.");
          return;
        }
        // TIMEOUT / POSITION_UNAVAILABLE: keep watching until our own timer;
        // a later high-accuracy fix may still arrive on mobile.
        if (best) return;
        if (error.code === error.TIMEOUT) {
          // Let the outer timer decide; do not hard-fail yet.
          return;
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
