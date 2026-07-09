export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GeolocationOptions {
  /** Maximum wait time in milliseconds. Defaults to 10 seconds. */
  timeoutMs?: number;
}

export function getCurrentPosition(options: GeolocationOptions = {}): Promise<Coordinates> {
  const timeoutMs = options.timeoutMs ?? 10_000;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device/browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location access was denied. Please allow location permissions to continue."));
        } else if (error.code === error.TIMEOUT) {
          reject(new Error("Unable to get your location. Please enable GPS and try again."));
        } else {
          reject(new Error("Unable to get your location. Please enable GPS and try again."));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
